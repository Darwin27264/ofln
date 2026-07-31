/* styles.ts */
import { StyleSheet, Dimensions } from "react-native";
import type { ThemeColors } from "../context/ThemeContext";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

/** Height of the soft fade above the chat input bar */
export const INPUT_FADE_HEIGHT = 40;
/** Height of the soft fade under the top action pills */
export const TOP_FADE_HEIGHT = 72;

export const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    fontFamily: "Poppins",
  },
  scrollView: {
    paddingBottom: 20,
  },

  /* Top-right container for both pills */
  topRightButtons: {
    position: "absolute",
    top: 8,
    right: 16,
    zIndex: 10,
    flexDirection: "row",
  },
  topRightPill: {
    backgroundColor: colors.transparent,
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  topRightPillText: {
    fontFamily: "Poppins",
    fontSize: 14,
    marginLeft: 6,
    color: colors.text,
  },

  /* Top-left pill for slide-out panel trigger */
  topLeftPill: {
    position: "absolute",
    top: 8,
    left: 16,
    zIndex: 10,
    backgroundColor: colors.transparent,
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },

  /* Slide-out panel style — frosted; tint comes from FrostedGlass */
  slideOutPanel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 250,
    backgroundColor: colors.transparent,
    zIndex: 5,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    overflow: "hidden",
  },

  greetingContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    alignItems: "center",
    zIndex: 2,
  },
  greetingText: {
    fontSize: 26,
    fontWeight: "300",
    textAlign: "center",
    color: colors.text,
    lineHeight: 32,
    fontFamily: "Poppins",
  },

  messageWrapper: {
    marginBottom: 12,
    width: "100%",
    alignItems: "flex-start",
    // No overflow:hidden here — it collapses measured height for long text
    // content on Android when combined with flexShrink inside child views.
  },
  messageBubble: {
    fontSize: 24,
    paddingVertical: 8,
    paddingHorizontal: 14,
    maxWidth: "80%",
    flexShrink: 1,
    alignItems: "flex-start",
    // overflow:hidden removed — border-radius clipping is handled by the
    // individual llamaBubble / userBubble styles where it is visually needed.
  },
  messageDirect: {
    width: "100%",
    maxWidth: "100%",
    flexShrink: 1,
    paddingVertical: 8,
    paddingHorizontal: 0,
    alignItems: "flex-start",
    minHeight: 36,
  },
  userBubble: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 18,
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
    minHeight: 36,
    overflow: "hidden",
  },
  llamaBubble: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 4,
    alignSelf: "flex-start",
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 36,
    overflow: "hidden",
  },
  messageText: {
    fontSize: 18,
    color: colors.textSecondary,
    fontFamily: "Poppins",
    lineHeight: 28,
  },
  userMessageText: {
    color: colors.primaryText,
    fontFamily: "Poppins",
    lineHeight: 28,
  },
  tokenInfo: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 4,
    textAlign: "right",
    fontFamily: "Poppins",
  },

  bottomContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.transparent,
  },
  inputFade: {
    ...StyleSheet.absoluteFillObject,
  },
  inputBarArea: {
    backgroundColor: colors.transparent,
    paddingTop: INPUT_FADE_HEIGHT,
  },
  topFade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: TOP_FADE_HEIGHT,
    zIndex: 9,
  },
  inputRowWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
  },
  addButtonOutside: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.transparent,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 2,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: colors.transparent,
    overflow: "hidden",
  },
  inputBarInRow: {
    flex: 1,
    marginLeft: 8,
    marginHorizontal: 0,
    marginBottom: 0,
  },
  input: {
    flex: 1,
    backgroundColor: colors.transparent,
    fontSize: 16,
    color: colors.text,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 140,
    fontFamily: "Poppins",
  },
  sendIconButton: {
    width: 44,
    height: 44,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  sendIconText: {
    color: colors.primaryText,
    fontSize: 18,
    fontWeight: "600",
    fontFamily: "Poppins",
  },
  stopButton: {
    width: 44,
    height: 44,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  attachmentPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.transparent,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  attachmentThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    marginRight: 10,
  },
  attachmentLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Poppins",
    color: colors.textSecondary,
  },
  attachmentRemove: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  toggleButton: {
    marginTop: 6,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    fontFamily: "Poppins",
  },
  thoughtContainer: {
    marginTop: 8,
    padding: 10,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    // stretch under messageWrapper's alignItems:flex-start so the box
    // gets a definite width; otherwise long thought text expands past the screen
    alignSelf: "stretch",
    maxWidth: "100%",
    overflow: "hidden",
  },
  thoughtTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
    fontFamily: "Poppins",
  },
  thoughtText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 16,
    fontFamily: "Poppins",
    width: "100%",
    flexShrink: 1,
  },

  card: {
    backgroundColor: colors.card,
    padding: 16,
    margin: 16,
    borderRadius: 8,
    fontFamily: "Poppins",
    borderWidth: 1,
    borderColor: colors.border,
  },
  subtitle: {
    fontSize: 18,
    color: colors.textSecondary,
    marginBottom: 8,
    fontFamily: "Poppins",
  },
  button: {
    backgroundColor: colors.secondary,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedButton: {
    backgroundColor: colors.primary,
  },
  buttonText: {
    fontSize: 16,
    color: colors.text,
    textAlign: "center",
    fontFamily: "Poppins",
  },
  modelContainer: {
    marginBottom: 8,
  },
  modelButton: {
    backgroundColor: colors.secondary,
    padding: 12,
    borderRadius: 8,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
  },
  modelButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  downloadProgressContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  cancelButton: {
    marginLeft: 8,
    padding: 4,
  },
  modelActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  deleteButton: {
    padding: 4,
  },
  modelStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  downloadedIndicator: {
    marginRight: 8,
  },
  downloadedIcon: {
    fontSize: 18,
    color: colors.accent,
    fontFamily: "Poppins",
  },
  notDownloadedIndicator: {
    marginRight: 8,
  },
  notDownloadedIcon: {
    fontSize: 18,
    color: colors.accent,
    fontFamily: "Poppins",
  },
  buttonTextGGUF: {
    fontSize: 18,
    color: colors.text,
    fontFamily: "Poppins",
  },
  selectedButtonText: {
    color: colors.primaryText,
    fontFamily: "Poppins",
  },
  downloadedText: {
    color: colors.accent,
    fontFamily: "Poppins",
  },
  loadModelIndicator: {
    marginTop: 4,
  },
  loadModelText: {
    fontSize: 18,
    color: colors.text,
    fontFamily: "Poppins",
  },
  downloadIndicator: {
    marginTop: 4,
  },
  downloadText: {
    fontSize: 18,
    color: colors.text,
    fontFamily: "Poppins",
  },

  /* SettingsScreen styles */
  settingsTitle: {
    fontSize: 36,
    fontWeight: "600",
    marginBottom: 5,
    fontFamily: "Poppins",
    color: colors.text,
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
    color: colors.text,
  },

  /* Settings screen styles */
  settingsBlock: {
    flex: 1,
    backgroundColor: colors.glass,
    borderRadius: 30,
    padding: 15,
    justifyContent: "flex-end",
    height: "100%",
    borderWidth: 1,
    borderColor: colors.border,
  },
  blockIcon: {
    position: "absolute",
    top: 15,
    right: 15,
  },
  blockTextContainer: {
    position: "absolute",
    bottom: 15,
    left: 15,
  },
  blockText: {
    fontSize: 18,
    fontWeight: "normal",
    textAlign: "left",
    color: colors.text,
    lineHeight: 22,
  },
  blockInfoIcon: {
    position: "absolute",
    bottom: 15,
    right: 15,
  },
  blockToggleText: {
    position: "absolute",
    bottom: 15,
    right: 15,
    fontSize: 15,
    fontWeight: "normal",
  },

  /* Additional styles for ModelSelection UI enhancements */

  /* Grid container for the big squares */
  modelFormatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    marginTop: 20,
  },

  /* Big square box for each model format */
  modelFormatBox: {
    width: screenWidth * 0.45,
    height: screenWidth * 0.45,
    backgroundColor: colors.glass,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.border,
    margin: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  modelFormatBoxText: {
    fontSize: 28,
    fontFamily: "Poppins",
    fontWeight: "500",
    color: colors.text,
    textAlign: "center",
    paddingHorizontal: 10,
  },

  downloadedModelButton: {
    backgroundColor: colors.success + "20",
    borderColor: colors.success + "40",
  },

  /* Pill-like back button at bottom-left */
  backPill: {
    position: "absolute",
    bottom: 30,
    left: 20,
    backgroundColor: colors.primary,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backPillIcon: {
    fontSize: 24,
    color: colors.primaryText,
    marginRight: 8,
    fontFamily: "Poppins",
  },
  backPillText: {
    color: colors.primaryText,
    fontSize: 18,
    fontFamily: "Poppins",
  },

  /* Note: floating selector panel lives in src/components/BottomSheet.tsx */
});

// Legacy export for backward compatibility (will be phased out)
export const styles = createStyles({
  background: "#FFFFFF",
  surface: "#F8F9FA",
  card: "#FFFFFF",
  overlay: "rgba(0, 0, 0, 0.1)",
  text: "#000000",
  textSecondary: "#334155",
  textTertiary: "#94A3B8",
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  primary: "#000000",
  primaryText: "#FFFFFF",
  secondary: "#EAEAEA",
  accent: "#2563EB",
  success: "#34C759",
  warning: "#FF9F0A",
  error: "#FF453A",
  transparent: "transparent",
  glass: "rgba(255, 255, 255, 0.75)",
} as ThemeColors);
