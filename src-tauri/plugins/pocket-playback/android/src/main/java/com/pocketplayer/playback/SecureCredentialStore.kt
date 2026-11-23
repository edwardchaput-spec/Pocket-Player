package com.pocketplayer.playback

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.security.MessageDigest
import java.security.ProviderException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Remembered Navidrome passwords on Android (ADR-012).
 *
 * A non-exportable AES-256-GCM key lives in the Android Keystore (StrongBox
 * when the phone has it). Only ciphertext is written, to this app's private
 * SharedPreferences, keyed by a hash of the account and bound to it as GCM
 * associated data. A value that no longer decrypts (key invalidated, data
 * restored onto another phone) is deleted and reported as absent, so the
 * user is simply asked to sign in again. Nothing here logs secrets.
 */
internal class SecureCredentialStore(context: Context) {
    private val preferences =
        context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    @Synchronized
    fun get(account: String): String? {
        val name = entryName(account)
        val stored = preferences.getString(name, null) ?: return null
        return try {
            decrypt(account, stored)
        } catch (error: GeneralSecurityException) {
            forget(name)
            null
        } catch (error: IllegalArgumentException) {
            forget(name)
            null
        }
    }

    @Synchronized
    fun set(account: String, secret: String) {
        val plain = secret.toByteArray(Charsets.UTF_8)
        try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key())
            cipher.updateAAD(account.toByteArray(Charsets.UTF_8))
            val sealed = cipher.doFinal(plain)
            val value = VERSION + ":" + encode(cipher.iv) + ":" + encode(sealed)
            if (!preferences.edit().putString(entryName(account), value).commit()) {
                throw GeneralSecurityException("credential write failed")
            }
        } finally {
            plain.fill(0)
        }
    }

    @Synchronized
    fun delete(account: String) {
        forget(entryName(account))
    }

    private fun forget(name: String) {
        preferences.edit().remove(name).commit()
    }

    private fun decrypt(account: String, stored: String): String {
        val parts = stored.split(':')
        require(parts.size == 3 && parts[0] == VERSION) { "unknown credential format" }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            existingKey() ?: throw GeneralSecurityException("credential key missing"),
            GCMParameterSpec(TAG_BITS, decode(parts[1])),
        )
        cipher.updateAAD(account.toByteArray(Charsets.UTF_8))
        val plain = cipher.doFinal(decode(parts[2]))
        return try {
            String(plain, Charsets.UTF_8)
        } finally {
            plain.fill(0)
        }
    }

    private fun existingKey(): SecretKey? {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        return keyStore.getKey(KEY_ALIAS, null) as? SecretKey
    }

    private fun key(): SecretKey = existingKey() ?: generateKey()

    private fun generateKey(): SecretKey {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                return generateKey(strongBox = true)
            } catch (error: StrongBoxUnavailableException) {
                // Fall through to the TEE-backed key.
            } catch (error: ProviderException) {
                // Some StrongBox implementations reject AES-256; use the TEE.
            }
        }
        return generateKey(strongBox = false)
    }

    private fun generateKey(strongBox: Boolean): SecretKey {
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
        // No user-authentication requirement: Android Auto must be able to
        // reconnect while the phone is locked in a car.
        if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            spec.setIsStrongBoxBacked(true)
        }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(spec.build())
        return generator.generateKey()
    }

    private fun entryName(account: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(account.toByteArray(Charsets.UTF_8))
        return "$VERSION." + digest.joinToString("") { "%02x".format(it) }
    }

    private fun encode(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)

    private fun decode(text: String): ByteArray = Base64.decode(text, Base64.NO_WRAP)

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "pocket-player.credentials.v1"
        const val PREFERENCES = "pocket_player_credentials"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val TAG_BITS = 128
        const val VERSION = "v1"
    }
}
