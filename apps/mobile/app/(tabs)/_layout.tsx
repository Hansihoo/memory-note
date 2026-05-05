import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#2F7D5C",
        tabBarInactiveTintColor: "#6B7280",
        tabBarLabelStyle: { fontSize: 12, fontWeight: "800" },
        tabBarStyle: {
          height: 64,
          borderTopColor: "#DDE7DF",
          backgroundColor: "#FFFFFF",
          paddingBottom: 8,
          paddingTop: 8
        }
      }}
    >
      <Tabs.Screen name="index" options={{ title: "홈" }} />
      <Tabs.Screen name="mistakes" options={{ title: "오답" }} />
      <Tabs.Screen name="profile" options={{ title: "프로필" }} />
      <Tabs.Screen name="settings" options={{ title: "설정" }} />
    </Tabs>
  );
}
