import { StyleSheet } from 'react-native';

export const appStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  authContainer: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#fff' },
  screenTitle: { fontSize: 28, fontWeight: '700', color: '#1a1a1a', padding: 16, paddingTop: 10 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 25, color: '#1a1a1a' },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', padding: 12, marginVertical: 6, borderRadius: 10,
    backgroundColor: '#f8f8f8', fontSize: 16,
  },
  switchText: { color: '#007bff', textAlign: 'center', marginTop: 15, fontSize: 14 },
  chatItem: {
    backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 4, borderRadius: 12,
    padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  chatItemContent: { flexDirection: 'row', alignItems: 'center' },
  avatarPlaceholder: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#007bff', justifyContent: 'center',
    alignItems: 'center', marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  chatInfo: { flex: 1 },
  chatName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  lastMsg: { color: '#8e8e93', marginTop: 3, fontSize: 13 },
  buttons: { padding: 16, gap: 10 },
  createButton: {
    backgroundColor: '#007bff', paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    marginVertical: 6,
  },
  createButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabledButton: { opacity: 0.6 },
  logoutButton: {
    backgroundColor: '#e9ecef', paddingVertical: 14, borderRadius: 12, alignItems: 'center',
  },
  logoutText: { color: '#343a40', fontSize: 16, fontWeight: '500' },
  messageBubble: {
    maxWidth: '80%', marginVertical: 3, padding: 10, borderRadius: 16,
  },
  myMessage: {
    alignSelf: 'flex-end', backgroundColor: '#007bff',
  },
  otherMessage: {
    alignSelf: 'flex-start', backgroundColor: '#e9ecef',
  },
  sender: { fontWeight: '700', fontSize: 12, marginBottom: 2, color: '#fff' },
  messageText: { fontSize: 15, color: '#fff' },
  file: { color: '#d4af37', marginTop: 3, fontSize: 12 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e0e0e0',
  },
  messageInput: {
    flex: 1, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 20, paddingHorizontal: 14,
    paddingVertical: 10, fontSize: 15, backgroundColor: '#f8f8f8',
  },
  sendButton: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#007bff', justifyContent: 'center',
    alignItems: 'center', marginLeft: 8,
  },
  sendButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  label: { fontSize: 15, fontWeight: '500', marginTop: 10, marginBottom: 4, color: '#1a1a1a' },
  typeRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 10 },
  typeButton: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0',
    alignItems: 'center', marginHorizontal: 4, backgroundColor: '#fff',
  },
  typeButtonActive: { backgroundColor: '#007bff', borderColor: '#007bff' },
  typeButtonText: { fontSize: 15, color: '#1a1a1a' },
  typeButtonTextActive: { color: '#fff' },
  // дополнительные стили для списка пользователей
  userItem: {
    paddingVertical: 12, paddingHorizontal: 15, borderBottomWidth: 1, borderColor: '#f0f0f0',
    flexDirection: 'row', alignItems: 'center',
  },
  userItemSelected: { backgroundColor: '#e8f0fe' },
  userAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#007bff', justifyContent: 'center',
    alignItems: 'center', marginRight: 10,
  },
  userAvatarText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  userName: { fontSize: 16, color: '#1a1a1a' },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#ccc',
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  checkboxChecked: { backgroundColor: '#007bff', borderColor: '#007bff' },
  searchInput: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 8, marginHorizontal: 15, marginBottom: 10, backgroundColor: '#f8f8f8',
  },
});
