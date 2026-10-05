import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  return {
    ...base,
    extra: {
      ...base.extra,
      eas: {
        ...base.extra?.eas,
        ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
          ? { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID }
          : {}),
      },
    },
  };
};
