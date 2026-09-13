import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  StyleSheet,
  Alert,
  Platform,
  BackHandler,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { FrostedGlass } from './FrostedGlass';
import { OVERLAY_MOTION } from '../utils/animationConfig';
import { useFadeScalePresence } from '../hooks/useFadeScalePresence';
import { useFloatingBackBottom } from '../utils/layoutInsets';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'destructive' | 'cancel';
}

type AlertTextAlign = 'center' | 'left';

interface ShowAlertOptions {
  cancelable?: boolean;
  /** Body (and title) alignment. Defaults to left to match BottomSheet popups. */
  textAlign?: AlertTextAlign;
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  buttons: AlertButton[];
  onDismiss?: () => void;
  cancelable?: boolean;
  textAlign?: AlertTextAlign;
}

let alertRef: {
  show: (
    title: string,
    message: string,
    buttons: AlertButton[],
    options?: boolean | ShowAlertOptions,
  ) => void;
  hide: () => void;
} | null = null;

function resolveAlertOptions(
  options?: boolean | ShowAlertOptions,
): { cancelable: boolean; textAlign: AlertTextAlign } {
  if (typeof options === 'boolean') {
    return { cancelable: options, textAlign: 'left' };
  }
  return {
    cancelable: options?.cancelable ?? true,
    textAlign: options?.textAlign ?? 'left',
  };
}

const SIDE_INSET = 14;

/**
 * Frosted floating-panel alert — same visual language as BottomSheet
 * (Diagnostics smoke test, Storage import, Models info sheets).
 * Absolute overlay (no RN Modal) so it stays reliable under native-driven parents.
 */
export const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  title,
  message,
  buttons,
  onDismiss,
  cancelable = true,
  textAlign = 'left',
}) => {
  const { theme } = useTheme();
  const bottomInset = useFloatingBackBottom();
  const alertOpacity = useRef(new Animated.Value(0)).current;
  const alertScale = useRef(new Animated.Value(OVERLAY_MOTION.FROM_SCALE)).current;
  const mounted = useFadeScalePresence(visible, alertOpacity, alertScale);
  const [maxHeight, setMaxHeight] = useState(
    () => Math.round(Dimensions.get('window').height * 0.85),
  );

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setMaxHeight(Math.round(window.height * 0.85));
    });
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (cancelable && onDismiss) {
        onDismiss();
        return true;
      }
      return true;
    });
    return () => sub.remove();
  }, [visible, cancelable, onDismiss]);

  const handleDismiss = () => {
    if (cancelable && onDismiss) {
      onDismiss();
    }
  };

  const handleButtonPress = (button: AlertButton) => {
    if (button.onPress) {
      button.onPress();
    }
    if (onDismiss) {
      onDismiss();
    }
  };

  // Primary / destructive first; cancel last — matches Storage / Diagnostics sheets.
  const orderedButtons = [
    ...buttons.filter((b) => b.style !== 'cancel'),
    ...buttons.filter((b) => b.style === 'cancel'),
  ];

  if (!mounted) {
    return null;
  }

  return (
    <View style={styles.host} pointerEvents="box-none" accessibilityViewIsModal>
      <TouchableWithoutFeedback onPress={handleDismiss}>
        <Animated.View
          style={[
            styles.overlay,
            {
              opacity: alertOpacity,
              backgroundColor: 'rgba(0, 0, 0, 0.28)',
            },
          ]}
        />
      </TouchableWithoutFeedback>

      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[
          styles.panel,
          {
            bottom: Math.max(SIDE_INSET, bottomInset),
            maxHeight,
            borderColor: theme.colors.border,
            opacity: alertOpacity,
            transform: [{ scale: alertScale }],
          },
        ]}
      >
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <FrostedGlass variant="panel" style={StyleSheet.absoluteFillObject} />
        </View>

        <ScrollView
          style={styles.fitScroll}
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: theme.colors.text, textAlign }]}>
            {title}
          </Text>
          {!!message && (
            <Text
              style={[
                styles.message,
                { color: theme.colors.textSecondary, textAlign },
              ]}
            >
              {message}
            </Text>
          )}

          <View style={styles.buttonContainer}>
            {orderedButtons.map((button, index) => {
              const isDestructive = button.style === 'destructive';
              const isCancel = button.style === 'cancel';
              return (
                <TouchableOpacity
                  key={`${button.text}-${index}`}
                  onPress={() => handleButtonPress(button)}
                  style={[
                    styles.button,
                    {
                      marginTop: index > 0 || message ? 10 : 16,
                      backgroundColor: isDestructive
                        ? theme.colors.error + '18'
                        : isCancel
                          ? theme.colors.surface
                          : theme.colors.primary,
                      borderWidth: isDestructive || isCancel ? 1 : 0,
                      borderColor: isDestructive
                        ? theme.colors.error + '40'
                        : theme.colors.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={button.text}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      {
                        color: isDestructive
                          ? theme.colors.error
                          : isCancel
                            ? theme.colors.text
                            : theme.colors.primaryText,
                      },
                    ]}
                  >
                    {button.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200000,
    elevation: 200000,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    position: 'absolute',
    left: SIDE_INSET,
    right: SIDE_INSET,
    backgroundColor: 'transparent',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
  },
  fitScroll: {
    flexGrow: 0,
  },
  inner: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Poppins',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    fontFamily: 'Poppins',
    lineHeight: 21,
    marginBottom: 6,
  },
  buttonContainer: {
    flexDirection: 'column',
    alignItems: 'stretch',
    width: '100%',
  },
  button: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Poppins',
    textAlign: 'center',
  },
  providerRoot: {
    flex: 1,
  },
});

export const showAlert = (
  title: string,
  message: string,
  buttons: AlertButton[] = [{ text: 'OK' }],
  options: boolean | ShowAlertOptions = true,
) => {
  const { cancelable, textAlign } = resolveAlertOptions(options);

  if (alertRef) {
    alertRef.show(title, message, buttons, { cancelable, textAlign });
    return;
  }

  Alert.alert(
    title,
    message,
    buttons.map((b) => ({
      text: b.text,
      style: b.style,
      onPress: b.onPress,
    })),
    { cancelable },
  );
};

export const CustomAlertProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [alertState, setAlertState] = useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons: AlertButton[];
    cancelable: boolean;
    textAlign: AlertTextAlign;
  }>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
    cancelable: true,
    textAlign: 'left',
  });

  useEffect(() => {
    alertRef = {
      show: (title, message, buttons, options = true) => {
        const resolved = resolveAlertOptions(options);
        setAlertState({
          visible: true,
          title,
          message,
          buttons,
          cancelable: resolved.cancelable,
          textAlign: resolved.textAlign,
        });
      },
      hide: () => {
        setAlertState((prev) => ({ ...prev, visible: false }));
      },
    };

    return () => {
      alertRef = null;
    };
  }, []);

  return (
    <View style={styles.providerRoot}>
      {children}
      <CustomAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        buttons={alertState.buttons}
        onDismiss={() => setAlertState((prev) => ({ ...prev, visible: false }))}
        cancelable={alertState.cancelable}
        textAlign={alertState.textAlign}
      />
    </View>
  );
};
