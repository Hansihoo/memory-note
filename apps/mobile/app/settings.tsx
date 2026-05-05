import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../src/auth/AuthContext";

export default function SettingsScreen() {
  const auth = useAuth();

  async function logout() {
    await auth.logout();
    router.replace("/");
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>설정</Text>
      <View style={styles.card}>
        <Text style={styles.label}>계정</Text>
        <Text style={styles.value}>{auth.user?.displayName ?? "로그인되지 않음"}</Text>
        <Text style={styles.label}>API</Text>
        <Text style={styles.value}>{auth.apiBaseUrl}</Text>
      </View>
      <Pressable onPress={logout} style={styles.logoutButton}>
        <Text style={styles.logoutText}>로그아웃</Text>
      </Pressable>
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>돌아가기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7FAF6",
    padding: 24,
    paddingTop: 72
  },
  eyebrow: {
    marginBottom: 20,
    color: "#1F2933",
    fontSize: 30,
    fontWeight: "800"
  },
  card: {
    gap: 8,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    padding: 20
  },
  label: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "700"
  },
  value: {
    marginBottom: 10,
    color: "#1F2933",
    fontSize: 16,
    fontWeight: "700"
  },
  logoutButton: {
    alignItems: "center",
    marginTop: 20,
    borderRadius: 16,
    backgroundColor: "#1F2933",
    paddingVertical: 15
  },
  logoutText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800"
  },
  backButton: {
    alignItems: "center",
    marginTop: 10,
    padding: 12
  },
  backText: {
    color: "#2F7D5C",
    fontSize: 15,
    fontWeight: "800"
  }
});
