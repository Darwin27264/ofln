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
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { OVERLAY_MOTION } from '../utils/animationConfig';
import { useFadeScalePresence } from '../hooks/useFadeScalePresence';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'destructive' | 'cancel';
}

type AlertTextAlign = 'center' | 'left';

interface ShowAlertOptions {
  cancelable?: boolean;
  /** Body (and title) alignment. Defaults to center; use left for long readable copy. */
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
    return { cancelable: options, textAlign: 'center' };
  }
  return {
    cancelable: options?.cancelable ?? true,
    textAlign: options?.textAlign ?? 'center',
  };
}

/**
 * In-tree absolute overlay alert (no RN Modal).
 * Modals nested under native-driven opacity/transform parents often fail on
 * Android — this pattern stays reliable while matching page enter/exit motion.
 */
export const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  title,
  message,
  buttons,
  onDismiss,
  cancelable = true,
  textAlign = 'center',
}) => {
  const { theme } = useTheme();
  const alertOpacity = useRef(new Animated.Value(0)).current;
  const alertScale = useRef(new Animated.Value(OVERLAY_MOTION.FROM_SCALE)).current;
  const mounted = useFadeScalePresence(visible, alertOpacity, alertScale);

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
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
            },
          ]}
        />
      </TouchableWithoutFeedback>

      <View style={styles.centerWrap} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.alertContainer,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              transform: [{ scale: alertScale }],
              opacity: alertOpacity,
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.colors.text, textAlign }]}>{title}</Text>
          <ScrollView
            style={styles.messageScroll}
            contentContainerStyle={styles.messageScrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={[styles.message, { color: theme.colors.textSecondary, textAlign }]}>
              {message}
            </Text>
          </ScrollView>
          <View style={styles.buttonContainer}>
            {orderedButtons.map((button, index) => (
              <TouchableOpacity
                key={`${button.text}-${index}`}
                onPress={() => handleButtonPress(button)}
                style={[
                  styles.button,
                  {
                    backgroundColor:
                      button.style === 'destructive'
                        ? theme.colors.error
                        : button.style === 'cancel'
                          ? theme.colors.glass
                          : theme.colors.primary,
                    borderWidth: button.style === 'cancel' ? 1 : 0,
                    borderColor: theme.colors.border,
                    marginTop: index > 0 ? 10 : 0,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    {
                      color:
                        button.style === 'destructive'
                          ? theme.colors.primaryText
                          : button.style === 'cancel'
                            ? theme.colors.text
                            : theme.colors.primaryText,
                    },
                  ]}
                >
                  {button.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </View>
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
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  alertContainer: {
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Poppins',
    marginBottom: 12,
  },
  messageScroll: {
    maxHeight: 320,
    marginBottom: 24,
  },
  messageScrollContent: {
    flexGrow: 0,
  },
  message: {
    fontSize: 16,
    fontFamily: 'Poppins',
    lineHeight: 22,
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
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
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
    textAlign: 'center',
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
