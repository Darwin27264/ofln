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
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'destructive' | 'cancel';
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  buttons: AlertButton[];
  onDismiss?: () => void;
  cancelable?: boolean;
}

let alertRef: {
  show: (title: string, message: string, buttons: AlertButton[], cancelable?: boolean) => void;
  hide: () => void;
} | null = null;

/**
 * In-tree absolute overlay alert (no RN Modal).
 * Modals nested under native-driven opacity/transform parents often fail on
 * Android — this pattern stays reliable while keeping the same pop-in animation.
 */
export const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  title,
  message,
  buttons,
  onDismiss,
  cancelable = true,
}) => {
  const { theme } = useTheme();
  const alertOpacity = useRef(new Animated.Value(0)).current;
  const alertScale = useRef(new Animated.Value(0.9)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      alertOpacity.setValue(0);
      alertScale.setValue(0.9);
      Animated.parallel([
        Animated.timing(alertOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(alertScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(alertOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(alertScale, {
        toValue: 0.9,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, alertOpacity, alertScale]);

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
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          <Text style={[styles.message, { color: theme.colors.textSecondary }]}>
            {message}
          </Text>
          <View style={styles.buttonContainer}>
            {buttons.map((button, index) => (
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
                    marginLeft: index > 0 ? 12 : 0,
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
    paddingHorizontal: 20,
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
  message: {
    fontSize: 16,
    fontFamily: 'Poppins',
    marginBottom: 24,
    lineHeight: 22,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    minWidth: 80,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Poppins',
  },
  providerRoot: {
    flex: 1,
  },
});

export const showAlert = (
  title: string,
  message: string,
  buttons: AlertButton[] = [{ text: 'OK' }],
  cancelable: boolean = true,
) => {
  if (alertRef) {
    alertRef.show(title, message, buttons, cancelable);
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
  }>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
    cancelable: true,
  });

  useEffect(() => {
    alertRef = {
      show: (title, message, buttons, cancelable = true) => {
        setAlertState({
          visible: true,
          title,
          message,
          buttons,
          cancelable,
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
      />
    </View>
  );
};
