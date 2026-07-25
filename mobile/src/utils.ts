import * as RNFS from 'react-native-fs';

export const SERVER_URL = 'http://192.168.1.200:5000';
const TOKEN_PATH = `${RNFS.DocumentDirectoryPath}/token.txt`;

export async function getToken(): Promise<string | null> {
  try {
    const exists = await RNFS.exists(TOKEN_PATH);
    if (exists) return await RNFS.readFile(TOKEN_PATH, 'utf8');
  } catch (e) {}
  return null;
}
