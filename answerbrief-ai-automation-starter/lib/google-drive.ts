import { createSign } from 'crypto';

type DriveFolder = {
  id: string;
  name: string;
  webViewLink: string;
};

type DriveFile = {
  id: string;
  name: string;
  webViewLink: string;
};

const driveFolderMimeType = 'application/vnd.google-apps.folder';
const driveApiBaseUrl = 'https://www.googleapis.com/drive/v3';
const tokenUrl = 'https://oauth2.googleapis.com/token';
const folderFields = 'id,name,webViewLink';

export function isDriveConfigured() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
  );
}

export async function createCustomerDriveWorkspace(folderName: string) {
  if (!isDriveConfigured()) {
    return null;
  }

  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID as string;
  const folder = await createDriveFolder(folderName, rootFolderId);

  await Promise.all([
    createDriveFolder('01 Intake', folder.id),
    createDriveFolder('02 Source Materials', folder.id),
    createDriveFolder('03 Working Files', folder.id),
    createDriveFolder('04 Final Delivery', folder.id),
    createDriveFolder('05 Follow Up', folder.id),
  ]);

  return folder;
}

export async function renameDriveFolder(folderId: string | undefined, folderName: string) {
  if (!folderId || !isDriveConfigured()) {
    return null;
  }

  const token = await getAccessToken();
  const response = await fetch(`${driveApiBaseUrl}/files/${folderId}?fields=${folderFields}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: folderName }),
  });

  if (!response.ok) {
    throw new Error(`Google Drive folder rename failed: ${await response.text()}`);
  }

  return response.json() as Promise<DriveFolder>;
}

export async function uploadDriveFile(
  parentFolderId: string | undefined,
  fileName: string,
  mimeType: string,
  bytes: Buffer
) {
  if (!parentFolderId || !isDriveConfigured()) {
    return null;
  }

  const token = await getAccessToken();
  const boundary = `answerbrief-${Date.now()}`;
  const metadata = {
    name: sanitizeDriveName(fileName) || 'Uploaded file',
    parents: [parentFolderId],
  };
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${folderFields}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!response.ok) {
    throw new Error(`Google Drive file upload failed: ${await response.text()}`);
  }

  return response.json() as Promise<DriveFile>;
}

export function buildProvisionalFolderName(customerEmail: string, packageName: string, createdAt: string) {
  return sanitizeDriveName(`${customerEmail} - ${packageName} - ${createdAt.slice(0, 10)}`);
}

export function buildCustomerFolderName(customerName: string, targetRole: string, createdAt: string) {
  return sanitizeDriveName(`${customerName} - ${targetRole} - ${createdAt.slice(0, 10)}`);
}

async function createDriveFolder(name: string, parentFolderId: string) {
  const token = await getAccessToken();
  const response = await fetch(`${driveApiBaseUrl}/files?fields=${folderFields}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: driveFolderMimeType,
      parents: [parentFolderId],
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Drive folder creation failed: ${await response.text()}`);
  }

  return response.json() as Promise<DriveFolder>;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({
    iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL as string,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: tokenUrl,
    exp: now + 3600,
    iat: now,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google access token request failed: ${await response.text()}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

function signJwt(payload: Record<string, string | number>) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const privateKey = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY as string);
  const signature = createSign('RSA-SHA256').update(unsignedToken).sign(privateKey);

  return `${unsignedToken}.${base64Url(signature)}`;
}

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/\\n/g, '\n');
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function sanitizeDriveName(value: string) {
  return value.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim();
}
