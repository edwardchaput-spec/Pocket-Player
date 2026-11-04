@file:androidx.annotation.OptIn(markerClass = [UnstableApi::class])

package com.pocketplayer.playback

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Pass-through audio processor that keeps the most recent mono samples so the
 * webview visualisers can be fed without Web Audio. Output audio is untouched.
 *
 * Frames mirror Web Audio `AnalyserNode` byte semantics (Blackman window,
 * 0.78 smoothing, -100 dB to -30 dB range) so existing visualisers render the
 * same on Android and Windows.
 */
object SpectrumTap : BaseAudioProcessor() {
    const val FFT_SIZE = 1024
    private const val BINS = FFT_SIZE / 2
    private const val SMOOTHING = 0.78
    private const val MIN_DB = -100.0
    private const val MAX_DB = -30.0

    private val ring = FloatArray(FFT_SIZE)
    private var writeIndex = 0
    private var channels = 2
    private val lock = Any()

    private val window = DoubleArray(FFT_SIZE) { i ->
        val x = 2.0 * PI * i / FFT_SIZE
        0.42 - 0.5 * cos(x) + 0.08 * cos(2.0 * x)
    }
    private val smoothed = DoubleArray(BINS)
    private val real = DoubleArray(FFT_SIZE)
    private val imaginary = DoubleArray(FFT_SIZE)

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) {
            // Not tappable (e.g. float or passthrough); stay inactive.
            return AudioProcessor.AudioFormat.NOT_SET
        }
        channels = inputAudioFormat.channelCount.coerceAtLeast(1)
        return inputAudioFormat
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val remaining = inputBuffer.remaining()
        if (remaining == 0) return
        val samples = inputBuffer.duplicate().order(ByteOrder.nativeOrder()).asShortBuffer()
        synchronized(lock) {
            while (samples.remaining() >= channels) {
                var mixed = 0f
                for (channel in 0 until channels) mixed += samples.get() / 32768f
                ring[writeIndex] = mixed / channels
                writeIndex = (writeIndex + 1) % FFT_SIZE
            }
        }
        replaceOutputBuffer(remaining).put(inputBuffer).flip()
    }

    override fun onReset() {
        synchronized(lock) {
            ring.fill(0f)
            writeIndex = 0
        }
        smoothed.fill(0.0)
    }

    /** Fills [frequency] (FFT_SIZE / 2 bytes) and [waveform] (FFT_SIZE bytes). Main thread only. */
    fun snapshot(frequency: ByteArray, waveform: ByteArray) {
        synchronized(lock) {
            for (i in 0 until FFT_SIZE) real[i] = ring[(writeIndex + i) % FFT_SIZE].toDouble()
        }
        for (i in 0 until FFT_SIZE) {
            waveform[i] = (128 + real[i] * 128).toInt().coerceIn(0, 255).toByte()
            real[i] *= window[i]
            imaginary[i] = 0.0
        }
        fft(real, imaginary)
        for (k in 0 until BINS) {
            val magnitude = sqrt(real[k] * real[k] + imaginary[k] * imaginary[k]) / FFT_SIZE
            smoothed[k] = SMOOTHING * smoothed[k] + (1 - SMOOTHING) * magnitude
            val decibels = if (smoothed[k] > 0) 20 * log10(smoothed[k]) else MIN_DB
            frequency[k] = (255 * (decibels - MIN_DB) / (MAX_DB - MIN_DB)).toInt().coerceIn(0, 255).toByte()
        }
    }

    /** In-place iterative radix-2 FFT. */
    private fun fft(re: DoubleArray, im: DoubleArray) {
        val n = re.size
        var j = 0
        for (i in 1 until n) {
            var bit = n shr 1
            while (j and bit != 0) {
                j = j xor bit
                bit = bit shr 1
            }
            j = j xor bit
            if (i < j) {
                re[i] = re[j].also { re[j] = re[i] }
                im[i] = im[j].also { im[j] = im[i] }
            }
        }
        var length = 2
        while (length <= n) {
            val angle = -2 * PI / length
            val wRe = cos(angle)
            val wIm = sin(angle)
            var start = 0
            while (start < n) {
                var curRe = 1.0
                var curIm = 0.0
                for (k in 0 until length / 2) {
                    val a = start + k
                    val b = a + length / 2
                    val tRe = re[b] * curRe - im[b] * curIm
                    val tIm = re[b] * curIm + im[b] * curRe
                    re[b] = re[a] - tRe
                    im[b] = im[a] - tIm
                    re[a] += tRe
                    im[a] += tIm
                    val nextRe = curRe * wRe - curIm * wIm
                    curIm = curRe * wIm + curIm * wRe
                    curRe = nextRe
                }
                start += length
            }
            length = length shl 1
        }
    }
}
