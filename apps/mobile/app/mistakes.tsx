import type { TodayCard } from "@memory-note/core";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../src/auth/AuthContext";

export default function MistakesScreen() {
  const auth = useAuth();
  const [cards, setCards] = useState<TodayCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMistakes = useCallback(async () => {
    if (auth.status !== "signedIn") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await auth.api.studyMistakes(30);
      setCards(response.cards);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "오답 노트를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [auth.api, auth.status]);

  useEffect(() => {
    loadMistakes();
  }, [loadMistakes]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>오답 노트</Text>
      {loading ? <ActivityIndicator color="#2F7D5C" /> : null}
      {error ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable onPress={loadMistakes} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : null}
      {!loading && !error && cards.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>최근 약점 카드가 없어요.</Text>
        </View>
      ) : null}
      {cards.map((card) => (
        <View key={card.cardId} style={styles.card}>
          <Text style={styles.prompt}>{card.prompt}</Text>
          <Text style={styles.answer}>{card.answer}</Text>
          <Text style={styles.meta}>lapses {card.lapses} · leech {card.leechScore}</Text>
        </View>
      ))}
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>돌아가기</Text>
      </Pressable>
    </ScrollView>
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
  card: {
    gap: 8,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    padding: 18
  },
  prompt: {
    color: "#1F2933",
    fontSize: 20,
    fontWeight: "800"
  },
  answer: {
    color: "#2F7D5C",
    fontSize: 17,
    fontWeight: "700"
  },
  meta: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "700"
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
