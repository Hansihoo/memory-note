import {
  ReviewRating,
  advanceStudySession,
  createStudySessionFromTodayCards,
  getCurrentStudyCard,
  revealStudySession,
  type StudySessionState,
  type TodaySummary
} from "@memory-note/core";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../src/auth/AuthContext";
import { createMobileReviewPayload } from "../src/study/reviewPayload";

export default function StudyScreen() {
  const auth = useAuth();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [session, setSession] = useState<StudySessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = useMemo(() => (session ? getCurrentStudyCard(session) : null), [session]);
  const progressText = session ? `${Math.min(session.index + 1, session.queue.length)} / ${session.queue.length}` : "0 / 0";

  const loadToday = useCallback(async () => {
    if (auth.status !== "signedIn") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await auth.api.studyToday(20);
      setSummary(response.summary);
      setSession(createStudySessionFromTodayCards(response.cards));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "오늘 복습을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [auth.api, auth.status]);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  async function submitReview(rating: ReviewRating) {
    if (!current?.cardId || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await auth.api.reviewCard(current.cardId, createMobileReviewPayload(current.cardId, rating));
      setSession((previous) => (previous ? advanceStudySession(previous) : previous));
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "리뷰를 저장하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (auth.status !== "signedIn") {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>로그인이 필요합니다</Text>
        <Pressable onPress={() => router.replace("/login")} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>로그인</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator color="#2F7D5C" />
        <Text style={styles.helper}>오늘 복습을 불러오는 중입니다</Text>
      </View>
    );
  }

  if (error && !current) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>불러오지 못했습니다</Text>
        <Text style={styles.helper}>{error}</Text>
        <Pressable onPress={loadToday} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }

  if (!current) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>오늘은 복습할 카드가 없어요</Text>
        <Text style={styles.helper}>새 카드 {summary?.newCount ?? 0}개, 약점 카드 {summary?.weakCount ?? 0}개</Text>
        <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.progress}>{progressText}</Text>
      <View style={styles.card}>
        <Text style={styles.prompt}>{current.prompt}</Text>
        {session?.revealed ? <Text style={styles.answer}>{current.answer}</Text> : <Text style={styles.hidden}>정답을 먼저 떠올려보세요</Text>}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {session?.revealed ? (
        <View style={styles.reviewRow}>
          <Pressable disabled={submitting} onPress={() => submitReview(ReviewRating.AGAIN)} style={styles.againButton}>
            <Text style={styles.reviewButtonText}>모름</Text>
          </Pressable>
          <Pressable disabled={submitting} onPress={() => submitReview(ReviewRating.HARD)} style={styles.hardButton}>
            <Text style={styles.reviewButtonText}>힘들게 맞춤</Text>
          </Pressable>
          <Pressable disabled={submitting} onPress={() => submitReview(ReviewRating.GOOD)} style={styles.goodButton}>
            <Text style={styles.reviewButtonText}>바로 앎</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setSession((previous) => (previous ? revealStudySession(previous) : previous))} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>정답 확인</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#F7FAF6",
    padding: 20
  },
  progress: {
    marginBottom: 16,
    color: "#6B7280",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center"
  },
  title: {
    marginBottom: 12,
    color: "#1F2933",
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center"
  },
  card: {
    minHeight: 260,
    justifyContent: "center",
    gap: 20,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    padding: 24
  },
  prompt: {
    color: "#1F2933",
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 38,
    textAlign: "center"
  },
  answer: {
    color: "#2F7D5C",
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 34,
    textAlign: "center"
  },
  hidden: {
    color: "#6B7280",
    fontSize: 16,
    textAlign: "center"
  },
  helper: {
    marginVertical: 16,
    color: "#6B7280",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center"
  },
  error: {
    marginTop: 14,
    color: "#B91C1C",
    fontSize: 14,
    textAlign: "center"
  },
  primaryButton: {
    alignItems: "center",
    marginTop: 20,
    borderRadius: 18,
    backgroundColor: "#2F7D5C",
    paddingVertical: 16
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800"
  },
  secondaryButton: {
    alignItems: "center",
    marginTop: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#B7D3C5",
    paddingVertical: 16
  },
  secondaryButtonText: {
    color: "#2F7D5C",
    fontSize: 17,
    fontWeight: "800"
  },
  reviewRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 20
  },
  againButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#9F1239",
    paddingVertical: 15
  },
  hardButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#B45309",
    paddingVertical: 15
  },
  goodButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#2F7D5C",
    paddingVertical: 15
  },
  reviewButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center"
  }
});
