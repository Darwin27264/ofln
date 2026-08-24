/**
 * Shared persona avatar: user photo when set, else Material icon name, else person.
 */

import React, { useMemo } from "react";
import { View, Image, StyleSheet } from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import {
  Persona,
  resolvePersonaAvatarUri,
} from "../services/personaService";

/** Map seed / free-text avatar keys to MaterialIcons names. */
const AVATAR_ICON_MAP: Record<string, string> = {
  detective: "search",
  "menu-book": "menu-book",
  school: "school",
  heart: "favorite",
  person: "person",
  star: "star",
  "handyman": "handyman",
  "emoji-people": "emoji-people",
  help: "help-outline",
  friend: "people",
};

export function resolvePersonaIconName(avatar?: string | null): string {
  if (!avatar || !avatar.trim()) return "person";
  const key = avatar.trim().toLowerCase();
  if (AVATAR_ICON_MAP[key]) return AVATAR_ICON_MAP[key];
  // Allow raw Material icon names users typed in older builds.
  return avatar.trim();
}

interface PersonaAvatarProps {
  persona: Persona | null | undefined;
  size?: number;
  backgroundColor?: string;
  iconColor?: string;
  borderRadius?: number;
}

export const PersonaAvatar: React.FC<PersonaAvatarProps> = React.memo(
  ({
    persona,
    size = 60,
    backgroundColor = "#E8E8E8",
    iconColor = "#333",
    borderRadius,
  }) => {
    const uri = useMemo(() => resolvePersonaAvatarUri(persona), [persona]);
    const radius = borderRadius ?? Math.round(size * 0.2);
    const iconSize = Math.round(size * 0.46);

    if (uri) {
      return (
        <Image
          source={{ uri }}
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor,
          }}
          resizeMode="cover"
        />
      );
    }

    return (
      <View
        style={[
          styles.fallback,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor,
          },
        ]}
      >
        <Icon
          name={resolvePersonaIconName(persona?.avatar)}
          size={iconSize}
          color={iconColor}
        />
      </View>
    );
  }
);

PersonaAvatar.displayName = "PersonaAvatar";

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
