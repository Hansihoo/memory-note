import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuth } from "../src/auth/AuthContext";

export default function RegisterScreen() {
  const auth = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await auth.register(username.trim(), password);
      router.replace("/");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "가입하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>회원가입</Text>
      <Text style={styles.label}>아이디</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setUsername}
        placeholder="username"
        style={styles.input}
        value={username}
      />
      <Text style={styles.label}>비밀번호</Text>
      <TextInput onChangeText={setPassword} placeholder="8자 이상" secureTextEntry style={styles.input} value={password} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable disabled={submitting} onPress={submit} style={styles.primaryButton}>
        {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>회원가입</Text>}
      </Pressable>
      <Pressable onPress={() => router.replace("/login")} style={styles.linkButton}>
        <Text style={styles.linkText}>이미 계정이 있나요? 로그인</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#F7FAF6",
    padding: 24
  },
  title: {
    marginBottom: 28,
    color: "#1F2933",
    fontSize: 30,
    fontWeight: "800"
  },
  label: {
    marginBottom: 8,
    color: "#4B5563",
    fontSize: 14,
    fontWeight: "700"
  },
  input: {
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#1F2933",
    fontSize: 16
  },
  error: {
    marginBottom: 12,
    color: "#B91C1C",
    fontSize: 14
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#2F7D5C",
    paddingVertical: 15
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800"
  },
  linkButton: {
    alignItems: "center",
    marginTop: 16,
    padding: 12
  },
  linkText: {
    color: "#2F7D5C",
    fontSize: 15,
    fontWeight: "700"
  }
});
