# EAS Update Code Signing Certificates

This directory holds the **public** code signing certificate used by EAS Update
to verify that OTA updates were signed by a trusted key.

## Generating the key pair

Run the following **outside** the repository so the private key is never
accidentally committed:

```bash
eas update:configure-code-signing --key-output-directory ../keys
```

This produces:

- `../keys/update-certificate.pem`  — public certificate (copy here as
  `certs/update-certificate.pem` and commit it)
- `../keys/update-private-key.pem`  — private key (NEVER commit; store in EAS
  secrets via `eas secret:create`)

## What to commit

| File | Commit? |
| --- | --- |
| `certs/update-certificate.pem` | Yes — this is the public key |
| `keys/update-private-key.pem` | **NEVER** — private key, must stay outside the repo |

The `frontend/keys/` directory is git-ignored. The `*.pem` and `*.key`
patterns are also ignored globally.

## Rotating the signing key

1. Generate a new key pair into a fresh external directory:
   ```bash
   eas update:configure-code-signing --key-output-directory ../keys-new
   ```
2. Replace `certs/update-certificate.pem` with the new public certificate and
   commit it.
3. Upload the new private key to EAS secrets.
4. Publish a new binary build so clients trust the new `keyid`.
5. Retire the old private key once no further updates need to be signed with it.

> Rotation requires a new binary release — clients only learn about new public
> keys through a native build, not an OTA update.
