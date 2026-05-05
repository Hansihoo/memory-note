import { ReviewRating, StudyPlatform } from "@memory-note/core";
import { StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Memory Note</Text>
        <Text style={styles.title}>오늘 복습을 준비했어요</Text>
        <Text style={styles.body}>모바일 앱은 서버 학습 큐와 공통 세션 엔진을 사용합니다.</Text>
        <Text style={styles.meta}>
          {StudyPlatform.MOBILE} · {ReviewRating.GOOD}
        </Text>
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
  meta: {
    color: "#4B5563",
    fontSize: 13,
    fontWeight: "700"
  }
});
