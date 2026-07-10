import { StyleSheet } from 'react-native';

const lightStyles = {
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  centered: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const },
  authContainer: { flex: 1, justifyContent: 'center' as const, padding: 20, backgroundColor: '#fff' },
  screenTitle: { fontSize: 28, fontWeight: '700' as const, color: '#1a1a1a', padding: 16, paddingTop: 10 },
  title: { fontSize: 26, fontWeight: '700' as const, textAlign: 'center' as const, marginBottom: 25, color: '#1a1a1a' },
  input: { borderWidth: 1, borderColor: '#e0e0e0', padding: 12, marginVertical: 6, borderRadius: 10, backgroundColor: '#f8f8f8', fontSize: 16, color: '#1a1a1a' },
  switchText: { color: '#007bff', textAlign: 'center' as const, marginTop: 15, fontSize: 14 },
  chatItem: { backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 4, borderRadius: 12, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  chatItemContent: { flexDirection: 'row' as const, alignItems: 'center' as const },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#007bff', justifyContent: 'center' as const, alignItems: 'center' as const, marginRight: 12 },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' as const },
  chatInfo: { flex: 1 },
  chatName: { fontSize: 16, fontWeight: '600' as const, color: '#1a1a1a' },
  lastMsg: { color: '#8e8e93', marginTop: 3, fontSize: 13 },
  buttons: { padding: 16, gap: 10 },
  createButton: { backgroundColor: '#007bff', paddingVertical: 14, borderRadius: 12, alignItems: 'center' as const, marginVertical: 6 },
  createButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' as const },
  disabledButton: { opacity: 0.6 },
  logoutButton: { backgroundColor: '#e9ecef', paddingVertical: 14, borderRadius: 12, alignItems: 'center' as const },
  logoutText: { color: '#343a40', fontSize: 16, fontWeight: '500' as const },
  messageBubble: { maxWidth: '80%', marginVertical: 3, padding: 10, borderRadius: 16 },
  myMessage: { alignSelf: 'flex-end' as const, backgroundColor: '#007bff' },
  otherMessage: { alignSelf: 'flex-start' as const, backgroundColor: '#e9ecef' },
  senderMy: { color: '#fff' },
  senderOther: { color: '#1a1a1a' },
  messageTextMy: { fontSize: 15, color: '#fff' },
  messageTextOther: { fontSize: 15, color: '#1a1a1a' },
  file: { color: '#d4af37', marginTop: 3, fontSize: 12 },
  inputRow: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e0e0e0' },
  messageInput: { flex: 1, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, backgroundColor: '#f8f8f8', color: '#1a1a1a' },
  sendButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#007bff', justifyContent: 'center' as const, alignItems: 'center' as const, marginLeft: 8 },
  sendButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' as const },
  label: { fontSize: 15, fontWeight: '500' as const, marginTop: 10, marginBottom: 4, color: '#1a1a1a' },
  userItem: { paddingVertical: 12, paddingHorizontal: 15, borderBottomWidth: 1, borderColor: '#f0f0f0', flexDirection: 'row' as const, alignItems: 'center' as const },
  userItemSelected: { backgroundColor: '#e8f0fe' },
  userName: { fontSize: 16, color: '#1a1a1a' },
  searchInput: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 15, marginBottom: 10, backgroundColor: '#f8f8f8', color: '#1a1a1a' },
};

const darkStyles = {
  ...lightStyles,
  container: { ...lightStyles.container, backgroundColor: '#1a1a1a' },
  authContainer: { ...lightStyles.authContainer, backgroundColor: '#2c2c2e' },
  screenTitle: { ...lightStyles.screenTitle, color: '#fff' },
  title: { ...lightStyles.title, color: '#fff' },
  input: { ...lightStyles.input, backgroundColor: '#3a3a3c', borderColor: '#555', color: '#fff' },
  chatItem: { ...lightStyles.chatItem, backgroundColor: '#2c2c2e' },
  chatName: { ...lightStyles.chatName, color: '#fff' },
  lastMsg: { ...lightStyles.lastMsg, color: '#aaa' },
  logoutButton: { ...lightStyles.logoutButton, backgroundColor: '#3a3a3c' },
  logoutText: { ...lightStyles.logoutText, color: '#fff' },
  otherMessage: { ...lightStyles.otherMessage, backgroundColor: '#3a3a3c' },
  senderOther: { color: '#fff' },
  messageTextOther: { color: '#fff' },
  inputRow: { ...lightStyles.inputRow, backgroundColor: '#2c2c2e', borderColor: '#555' },
  messageInput: { ...lightStyles.messageInput, backgroundColor: '#3a3a3c', borderColor: '#555', color: '#fff' },
  label: { ...lightStyles.label, color: '#fff' },
  userName: { ...lightStyles.userName, color: '#fff' },
  searchInput: { ...lightStyles.searchInput, backgroundColor: '#3a3a3c', borderColor: '#555', color: '#fff' },
};

export function getStyles(theme: 'light' | 'dark') {
  return StyleSheet.create(theme === 'dark' ? darkStyles : lightStyles);
}

export const appStyles = getStyles('light');
