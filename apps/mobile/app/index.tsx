import { Link } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../src/auth/AuthContext";

export default function HomeScreen() {
  const auth = useAuth();

  if (auth.status === "loading") {
    return (
      <View style={styles.screen}>
        <ActivityIndicator color="#2F7D5C" />
        <Text style={styles.loadingText}>로그인 상태를 확인하고 있어요</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Memory Note</Text>
        <Text style={styles.title}>{auth.status === "signedIn" ? "오늘 복습을 준비했어요" : "모바일 학습을 시작하세요"}</Text>
        <Text style={styles.body}>
          {auth.status === "signedIn"
            ? `${auth.user?.displayName ?? "사용자"}님, 서버 학습 큐를 불러올 준비가 됐습니다.`
            : "로그인하면 오늘 복습과 장기 기억 점검을 모바일에서 이어갈 수 있습니다."}
        </Text>
        {auth.status === "signedIn" ? (
          <View style={styles.actions}>
            <Link href="/settings" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>설정</Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          <View style={styles.actions}>
            <Link href="/login" asChild>
              <Pressable style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>로그인</Text>
              </Pressable>
            </Link>
            <Link href="/register" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>회원가입</Text>
              </Pressable>
            </Link>
          </View>
        )}
      </View>
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
  card: {
    gap: 14,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    padding: 24,
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4
  },
  loadingText: {
    marginTop: 12,
    color: "#6B7280",
    fontSize: 15
  },
  eyebrow: {
    color: "#2F7D5C",
    fontSize: 15,
    fontWeight: "700"
  },
  title: {
    color: "#1F2933",
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 32
  },
  body: {
    color: "#6B7280",
    fontSize: 16,
    lineHeight: 23
  },
  actions: {
    gap: 10
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#2F7D5C",
    paddingVertical: 14
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800"
  },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#B7D3C5",
    paddingVertical: 14
  },
  secondaryButtonText: {
    color: "#2F7D5C",
    fontSize: 16,
    fontWeight: "800"
  }
});
