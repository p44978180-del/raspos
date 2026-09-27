package ru.timacad.platform

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import java.security.KeyStore
import org.json.JSONObject
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.runBlocking

class AndroidPasskeyPrompt(private val context: Context) : PasskeyPrompt {
    private val manager = CredentialManager.create(context)

    override fun create(requestJson: String): String = runBlocking {
        try {
            val result = manager.createCredential(context, CreatePublicKeyCredentialRequest(publicKeyJson(requestJson)))
            (result as CreatePublicKeyCredentialResponse).registrationResponseJson
        } catch (_: CreateCredentialCancellationException) {
            throw PasskeyPromptException("Создание ключа отменено")
        } catch (_: CreateCredentialNoCreateOptionException) {
            throw PasskeyPromptException("Настройте блокировку экрана и провайдер ключей доступа в настройках Android")
        }
    }

    override fun get(requestJson: String): String = runBlocking {
        try {
            val result = manager.getCredential(context, GetCredentialRequest(listOf(GetPublicKeyCredentialOption(publicKeyJson(requestJson)))))
            (result.credential as PublicKeyCredential).authenticationResponseJson
        } catch (_: GetCredentialCancellationException) {
            throw PasskeyPromptException("Вход отменён")
        } catch (_: NoCredentialException) {
            throw PasskeyPromptException("Ключ доступа не найден. Создайте ключ или выберите другой провайдер.")
        }
    }

    private fun publicKeyJson(body: String): String {
        return try {
            val root = JSONObject(body)
            if (root.has("publicKey")) root.getJSONObject("publicKey").toString() else body
        } catch (_: Throwable) {
            body
        }
    }
}

class KeystoreVault(context: Context) : SessionVault {
    private val prefs = context.getSharedPreferences("timacad.session", Context.MODE_PRIVATE)

    override fun save(token: String) {
        check(prefs.edit().putString("sealed", seal(token)).commit()) { "Cannot save session" }
    }

    override fun load(): String? = prefs.getString("sealed", null)?.let(::open)

    override fun clear() {
        check(prefs.edit().remove("sealed").commit()) { "Cannot clear session" }
    }

    private fun seal(token: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val body = cipher.doFinal(token.encodeToByteArray())
        val packed = cipher.iv + body
        return Base64.encodeToString(packed, Base64.NO_WRAP)
    }

    private fun open(sealed: String): String? {
        return try {
            val packed = Base64.decode(sealed, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, packed.copyOfRange(0, 12)))
            cipher.doFinal(packed.copyOfRange(12, packed.size)).decodeToString()
        } catch (_: Throwable) {
            null
        }
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = store.getKey(ALIAS, null) as? SecretKey
        if (existing != null) return existing
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val ALIAS = "timacad-session"
    }
}
