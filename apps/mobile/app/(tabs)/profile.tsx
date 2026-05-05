import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { ProfileSummary } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";

export default function ProfileScreen() {
  const auth = useAuth();
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (auth.status !== "signedIn") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSummary(await auth.api.profileSummary());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "프로필을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [auth.api, auth.status]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>프로필</Text>
      {loading ? <ActivityIndicator color="#2F7D5C" /> : null}
      {error ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable onPress={loadProfile} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : null}
      {summary ? (
        <>
          <View style={styles.grid}>
            <Metric label="누적 학습일" value={summary.cumulativeLearningDays} />
            <Metric label="오늘 학습" value={summary.todayStudiedCount} />
            <Metric label="암기 항목" value={summary.memorizedWordCount} />
            <Metric label="약점 카드" value={summary.weakCardCount} />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>장기 기억</Text>
            <MetricRow label="마스터 항목" value={summary.masteredCount} />
            <MetricRow label="30일 장기 복습" value={summary.longTermReviewCount30d} />
            <MetricRow label="30일 장기 정답" value={summary.longTermCorrectCount30d} />
            <MetricRow label="30일 회상률" value={`${Math.round(summary.longTermRecallRate30d * 100)}%`} />
            <MetricRow label="30일 lapse" value={summary.masteredLapseCount30d} />
            <MetricRow label="점검 후보" value={summary.oldMasteredDueCount} />
          </View>
        </>
      ) : null}
      {!loading && !error && !summary ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>표시할 프로필 정보가 아직 없어요.</Text>
        </View>
      ) : null}
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>돌아가기</Text>
      </Pressable>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function MetricRow({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 14,
    minHeight: "100%",
    backgroundColor: "#F7FAF6",
    padding: 20,
    paddingTop: 72
  },
  title: {
    color: "#1F2933",
    fontSize: 30,
    fontWeight: "800"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  metric: {
    width: "48%",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 16,
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2
  },
  metricValue: {
    color: "#1F2933",
    fontSize: 28,
    fontWeight: "800"
  },
  metricLabel: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "700"
  },
  card: {
    gap: 12,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    padding: 18,
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2
  },
  cardTitle: {
    color: "#1F2933",
    fontSize: 20,
    fontWeight: "800"
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  rowLabel: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "700"
  },
  rowValue: {
    color: "#2F7D5C",
    fontSize: 14,
    fontWeight: "800"
  },
  stateCard: {
    gap: 12,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    padding: 18
  },
  stateText: {
    color: "#6B7280",
    fontSize: 15,
    lineHeight: 22
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#2F7D5C",
    paddingVertical: 14
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800"
  },
  backButton: {
    alignItems: "center",
    padding: 14
  },
  backText: {
    color: "#2F7D5C",
    fontSize: 15,
    fontWeight: "800"
  }
});
