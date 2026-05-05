import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { TodaySummary } from "@memory-note/core";

import { useAuth } from "../src/auth/AuthContext";

export default function HomeScreen() {
  const auth = useAuth();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (auth.status !== "signedIn") {
      setSummary(null);
      return;
    }
    auth.api
      .studyToday(10)
      .then((response) => {
        if (!cancelled) {
          setSummary(response.summary);
          setSummaryError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSummaryError(error instanceof Error ? error.message : "오늘 복습을 불러오지 못했습니다.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [auth.api, auth.status]);

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
            ? `${auth.user?.displayName ?? "사용자"}님, 오늘의 복습 큐를 바로 시작할 수 있습니다.`
            : "로그인하면 오늘 복습과 장기 기억 점검을 모바일에서 이어갈 수 있습니다."}
        </Text>
        {auth.status === "signedIn" ? (
          <View style={styles.actions}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{summary?.dueCount ?? 0}</Text>
                <Text style={styles.summaryLabel}>복습</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{summary?.newCount ?? 0}</Text>
                <Text style={styles.summaryLabel}>새 카드</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{summary?.weakCount ?? 0}</Text>
                <Text style={styles.summaryLabel}>약점</Text>
              </View>
            </View>
            {summary?.masteredCheckCount ? (
              <Text style={styles.helper}>장기 기억 점검 {summary.masteredCheckCount}개가 포함됐어요.</Text>
            ) : null}
            {summaryError ? <Text style={styles.error}>{summaryError}</Text> : null}
            <Link href="/study" asChild>
              <Pressable style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>오늘 복습 시작</Text>
              </Pressable>
            </Link>
            <Link href="/settings" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>설정</Text>
              </Pressable>
            </Link>
            <View style={styles.linkRow}>
              <Link href="/mistakes" asChild>
                <Pressable style={styles.linkPill}>
                  <Text style={styles.linkPillText}>오답 노트</Text>
                </Pressable>
              </Link>
              <Link href="/profile" asChild>
                <Pressable style={styles.linkPill}>
                  <Text style={styles.linkPillText}>프로필</Text>
                </Pressable>
              </Link>
            </View>
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
  summaryRow: {
    flexDirection: "row",
    gap: 10
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#EEF7F1",
    paddingVertical: 12
  },
  summaryValue: {
    color: "#1F2933",
    fontSize: 22,
    fontWeight: "800"
  },
  summaryLabel: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "700"
  },
  helper: {
    color: "#6B7280",
    fontSize: 13,
    textAlign: "center"
  },
  error: {
    color: "#B91C1C",
    fontSize: 13,
    textAlign: "center"
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
  },
  linkRow: {
    flexDirection: "row",
    gap: 10
  },
  linkPill: {
    flex: 1,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    paddingVertical: 12
  },
  linkPillText: {
    color: "#4B5563",
    fontSize: 14,
    fontWeight: "800"
  }
});
