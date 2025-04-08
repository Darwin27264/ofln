/* styles.ts */
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    fontFamily: "Poppins",
  },
  scrollView: {
    paddingBottom: 20,
  },

  /* Top-right container for both pills */
  topRightButtons: {
    position: "absolute",
    top: 20,
    right: 16,
    zIndex: 10,
    flexDirection: "row",
  },
  topRightPill: {
    backgroundColor: "#EAEAEA",
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  topRightPillText: {
    fontFamily: "Poppins",
    fontSize: 14,
    marginLeft: 6,
    color: "#000",
  },

  /* Top-left pill for slide-out panel trigger */
  topLeftPill: {
    position: "absolute",
    top: 20,
    left: 16,
    zIndex: 10,
    backgroundColor: "#EAEAEA",
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },

  /* Slide-out panel style */
  slideOutPanel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 250,
    backgroundColor: "#F2F2F2",
    zIndex: 5,
    elevation: 5,
  },

  greetingContainer: {
    position: "absolute",
    top: "65%",
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    alignItems: "flex-start",
    zIndex: 2,
    transform: [{ translateY: -50 }],
  },
  greetingText: {
    fontSize: 36,
    fontWeight: "300",
    textAlign: "left",
    color: "#334155",
    marginRight: 80,
    lineHeight: 40,
    fontFamily: "Poppins",
  },

  messageWrapper: {
    marginBottom: 16,
  },
  messageBubble: {
    fontSize: 24,
    paddingVertical: 1,
    paddingHorizontal: 10,
    maxWidth: "80%",
  },
  userBubble: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 5,
    borderBottomLeftRadius: 20,
    alignSelf: "flex-end",
    backgroundColor: "#EAEAEA",
  },
  llamaBubble: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 5,
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  messageText: {
    fontSize: 18,
    color: "#334155",
    fontFamily: "Poppins",
  },
  userMessageText: {
    color: "#000000",
    fontFamily: "Poppins",
  },
  tokenInfo: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
    textAlign: "right",
    fontFamily: "Poppins",
  },

  bottomContainer: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 6,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    fontSize: 18,
    color: "#334155",
    paddingVertical: 4,
    fontFamily: "Poppins",
  },
  sendIconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  sendIconText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    fontFamily: "Poppins",
  },
  stopButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  toggleButton: {
    marginTop: 8,
    paddingVertical: 4,
  },
  toggleText: {
    color: "#000000",
    fontSize: 12,
    fontWeight: "500",
    fontFamily: "Poppins",
  },
  thoughtContainer: {
    marginTop: 8,
    padding: 10,
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
  },
  thoughtTitle: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
    fontFamily: "Poppins",
  },
  thoughtText: {
    color: "#475569",
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 16,
    fontFamily: "Poppins",
  },

  card: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    margin: 16,
    borderRadius: 8,
    fontFamily: "Poppins",
  },
  subtitle: {
    fontSize: 18,
    color: "#334155",
    marginBottom: 8,
    fontFamily: "Poppins",
  },
  button: {
    backgroundColor: "#EAEAEA",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedButton: {
    backgroundColor: "#C0C0C0",
  },
  buttonText: {
    fontSize: 18,
    color: "#000000",
    textAlign: "center",
    fontFamily: "Poppins",
  },
  modelContainer: {
    marginBottom: 8,
  },
  modelButton: {
    backgroundColor: "#EAEAEA",
    padding: 12,
    borderRadius: 8,
  },
  modelButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modelStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  downloadedIndicator: {
    marginRight: 8,
  },
  downloadedIcon: {
    fontSize: 18,
    color: "#2563EB",
    fontFamily: "Poppins",
  },
  notDownloadedIndicator: {
    marginRight: 8,
  },
  notDownloadedIcon: {
    fontSize: 18,
    color: "#2563EB",
    fontFamily: "Poppins",
  },
  buttonTextGGUF: {
    fontSize: 18,
    color: "#000000",
    fontFamily: "Poppins",
  },
  selectedButtonText: {
    color: "#FFFFFF",
    fontFamily: "Poppins",
  },
  downloadedText: {
    color: "#2563EB",
    fontFamily: "Poppins",
  },
  loadModelIndicator: {
    marginTop: 4,
  },
  loadModelText: {
    fontSize: 18,
    color: "#000000",
    fontFamily: "Poppins",
  },
  downloadIndicator: {
    marginTop: 4,
  },
  downloadText: {
    fontSize: 18,
    color: "#000000",
    fontFamily: "Poppins",
  },

  /* SettingsScreen styles */
  settingsTitle: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 20,
    fontFamily: "Poppins",
    color: "#334155",
  },
  settingsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    alignItems: "center",
  },
  settingsLabel: {
    fontSize: 18,
    fontFamily: "Poppins",
    color: "#000",
  },
  settingsBackButton: {
    backgroundColor: "#000000",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  settingsBackButtonText: {
    fontSize: 18,
    fontFamily: "Poppins",
    color: "#FFFFFF",
  },
});
