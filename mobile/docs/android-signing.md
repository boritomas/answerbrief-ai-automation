# AnswerBrief AI Android Signing

## Application ID

Production Android application ID:

```text
com.nieveslabs.answerbriefai
```

This value is configured in `app.config.ts` at `android.package`.

## Upload Keystore

A new production upload keystore was generated because no local production keystore was present in the mobile project.

Private keystore location on Tomas's Mac:

```text
/Users/tomasnieves/Documents/Codex/secure/answerbrief-ai/android/answerbrief-ai-upload-keystore.jks
```

Private password files:

```text
/Users/tomasnieves/Documents/Codex/secure/answerbrief-ai/android/keystore-password.txt
/Users/tomasnieves/Documents/Codex/secure/answerbrief-ai/android/key-password.txt
```

The keystore uses alias:

```text
upload
```

The mobile project has a local untracked `credentials.json` file that points EAS/local builds to this keystore. It is intentionally ignored by git.

## Google Play Upload Certificate

Upload this public certificate file to Google Play if Google asks for the upload key certificate:

```text
build-credentials/answerbrief-ai-upload-certificate.pem
```

This is a public certificate only. It does not contain the private key.

Certificate fingerprints:

```text
SHA1: 95:5F:B3:D4:53:1D:B5:5F:39:10:22:5D:65:B8:68:DD:AF:53:17:67
SHA256: 20:FE:51:CE:5A:05:5C:B5:DE:02:5C:5D:C0:AC:3E:A0:26:FE:B0:B2:DC:0D:3E:A0:0A:AC:15:13:0C:FA:B1:26
```

## Backup Procedure

Back up the entire secure signing folder:

```text
/Users/tomasnieves/Documents/Codex/secure/answerbrief-ai/android
```

Recommended backups:

1. Add the keystore and password files to a password manager secure file vault.
2. Store a second encrypted copy on an external drive.
3. Do not email the keystore or password files.
4. Do not commit the keystore, passwords, or `credentials.json`.

If the upload keystore is lost after publishing, Google Play upload-key reset will be required.

## Regenerate Public Certificate

If needed, regenerate the Google Play upload certificate from the private keystore:

```bash
keytool -exportcert -rfc \
  -keystore /Users/tomasnieves/Documents/Codex/secure/answerbrief-ai/android/answerbrief-ai-upload-keystore.jks \
  -storepass:file /Users/tomasnieves/Documents/Codex/secure/answerbrief-ai/android/keystore-password.txt \
  -alias upload \
  -file build-credentials/answerbrief-ai-upload-certificate.pem
```
