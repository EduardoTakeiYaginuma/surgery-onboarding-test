import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
} from "@expo-google-fonts/archivo";
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
} from "@expo-google-fonts/ibm-plex-mono";
import {
  Spectral_300Light,
  Spectral_400Regular,
  Spectral_500Medium,
} from "@expo-google-fonts/spectral";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isConnectivityError, setBaseUrl } from "@workspace/api-client-react";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SurgeryReminders } from "@/components/surgery-reminders";
import colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { DialogsProvider } from "@/hooks/useDialogs";
import { isNotificationsSupported } from "@/lib/notifications";
import { ThemeProvider, useThemePreference } from "@/hooks/useTheme";

// Expo bundles run outside the web proxy and need an absolute URL to reach the
// shared API server.
setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

// Keep the launch background on-brand (Meia-noite).
SystemUI.setBackgroundColorAsync(colors.dark.background);

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Auto-retry transient connectivity blips a couple of times before
      // surfacing the friendly connection screen; never retry genuine logical
      // errors (404 / 400 / 422 etc.).
      retry: (failureCount, error) =>
        isConnectivityError(error) && failureCount < 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    },
  },
});

function RootLayoutNav() {
  const themeColors = useColors();
  const { theme } = useThemePreference();
  return (
    <>
      {isNotificationsSupported ? <SurgeryReminders /> : null}
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: themeColors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="avisos" />
        <Stack.Screen name="contrato-modelos" />
        <Stack.Screen name="paciente/[id]" />
        <Stack.Screen name="paciente/conteudo/[id]" />
        <Stack.Screen
          name="novo"
          options={{
            // On native this is a slide-up modal. On web, Expo Router renders
            // modal screens inside a vaul drawer whose built-in close/backdrop
            // chrome dismisses via `goBack()` and bypasses the unsaved-edits
            // guard on our custom buttons. A plain card has no such chrome, so
            // the guarded header "X" stays the only way out.
            presentation: Platform.OS === "web" ? "card" : "modal",
            animation: "slide_from_bottom",
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Spectral_300Light,
    Spectral_400Regular,
    Spectral_500Medium,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <ThemeProvider>
                <DialogsProvider>
                  <RootLayoutNav />
                </DialogsProvider>
              </ThemeProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
