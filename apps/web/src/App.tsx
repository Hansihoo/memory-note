import { BookOpen, Check, ChevronLeft, ChevronRight, Download, LogOut, Plus, Trash2, Upload, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ClipboardEvent, FormEvent } from "react";
import { BASIC_REVIEW_RATING_BY_ACTION, StudyPlatform } from "@memory-note/core";
import { apiClient } from "./api/client";
import type { MistakeCard, ProfileSummary, ReviewRating, UserProfile, Word, Wordbook } from "./types";
import { parseWordMarkdown, serializeWordsToMarkdown } from "./utils/markdown";
import {
  cardTypeFromDirection,
  createStudySession,
  createStudySessionFromCards,
  getCurrentCard,
  markCurrentViewed,
  nextCard,
  revealCurrent,
  type StudySession
} from "./utils/session";
import { createBrowserSpeechDriver, detectSpeechLanguage } from "./utils/speech";

const DRAFT_ROW_COUNT = 1;
const BLANK_SHEET_ROW_COUNT = 18;
const DEMO_USERNAME_KEY = "memory-assistant-demo-username";
const DEMO_PASSWORD = "password123";
const COMPACT_STUDY_TEXT_LENGTH = 15;
const SAMPLE_WORDBOOK_NAME = "암기 노트 기본 단어";
const SAMPLE_SENTENCE_WORDBOOK_NAME = "암기 노트 기본 문장";
const LEGACY_SAMPLE_WORDBOOK_NAME = "기본 영어 단어장";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const GOOGLE_IDENTITY_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const GOOGLE_PICKER_SCRIPT_URL = "https://apis.google.com/js/api.js";

const googleDriveConfig = {
  clientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim(),
  apiKey: (import.meta.env.VITE_GOOGLE_API_KEY ?? "").trim(),
  appId: (import.meta.env.VITE_GOOGLE_APP_ID ?? "").trim()
};

const sampleWords = [
  { key: "airport", value: "공항" },
  { key: "passport", value: "여권" },
  { key: "boarding pass", value: "탑승권" },
  { key: "ticket", value: "표" },
  { key: "flight", value: "항공편" },
  { key: "gate", value: "탑승구" },
  { key: "terminal", value: "터미널" },
  { key: "luggage", value: "짐" },
  { key: "baggage", value: "수하물" },
  { key: "carry-on", value: "기내 수하물" },
  { key: "suitcase", value: "여행가방" },
  { key: "backpack", value: "배낭" },
  { key: "security", value: "보안 검색" },
  { key: "customs", value: "세관" },
  { key: "immigration", value: "입국 심사" },
  { key: "visa", value: "비자" },
  { key: "arrival", value: "도착" },
  { key: "departure", value: "출발" },
  { key: "delay", value: "지연" },
  { key: "cancelled", value: "취소된" },
  { key: "transfer", value: "환승" },
  { key: "connection", value: "연결편" },
  { key: "baggage claim", value: "수하물 찾는 곳" },
  { key: "currency", value: "통화" },
  { key: "exchange", value: "환전" },
  { key: "cash", value: "현금" },
  { key: "credit card", value: "신용카드" },
  { key: "receipt", value: "영수증" },
  { key: "price", value: "가격" },
  { key: "discount", value: "할인" },
  { key: "tip", value: "팁" },
  { key: "taxi", value: "택시" },
  { key: "bus", value: "버스" },
  { key: "train", value: "기차" },
  { key: "subway", value: "지하철" },
  { key: "platform", value: "승강장" },
  { key: "station", value: "역" },
  { key: "ticket machine", value: "발권기" },
  { key: "map", value: "지도" },
  { key: "directions", value: "길 안내" },
  { key: "address", value: "주소" },
  { key: "hotel", value: "호텔" },
  { key: "hostel", value: "호스텔" },
  { key: "reservation", value: "예약" },
  { key: "check-in", value: "체크인" },
  { key: "check-out", value: "체크아웃" },
  { key: "room", value: "방" },
  { key: "key", value: "열쇠" },
  { key: "card key", value: "카드키" },
  { key: "elevator", value: "엘리베이터" },
  { key: "lobby", value: "로비" },
  { key: "reception", value: "프런트" },
  { key: "towel", value: "수건" },
  { key: "blanket", value: "담요" },
  { key: "pillow", value: "베개" },
  { key: "shower", value: "샤워" },
  { key: "toilet", value: "화장실" },
  { key: "soap", value: "비누" },
  { key: "shampoo", value: "샴푸" },
  { key: "water", value: "물" },
  { key: "food", value: "음식" },
  { key: "menu", value: "메뉴" },
  { key: "bill", value: "계산서" },
  { key: "breakfast", value: "아침 식사" },
  { key: "lunch", value: "점심 식사" },
  { key: "dinner", value: "저녁 식사" },
  { key: "snack", value: "간식" },
  { key: "vegetarian", value: "채식주의자" },
  { key: "allergy", value: "알레르기" },
  { key: "pharmacy", value: "약국" },
  { key: "medicine", value: "약" },
  { key: "hospital", value: "병원" },
  { key: "doctor", value: "의사" },
  { key: "emergency", value: "응급 상황" },
  { key: "police", value: "경찰" },
  { key: "lost", value: "잃어버린" },
  { key: "found", value: "발견된" },
  { key: "help", value: "도움" },
  { key: "entrance", value: "입구" },
  { key: "exit", value: "출구" },
  { key: "open", value: "열려 있는" },
  { key: "closed", value: "닫힌" },
  { key: "today", value: "오늘" },
  { key: "tomorrow", value: "내일" },
  { key: "yesterday", value: "어제" },
  { key: "morning", value: "아침" },
  { key: "afternoon", value: "오후" },
  { key: "evening", value: "저녁" },
  { key: "night", value: "밤" },
  { key: "right", value: "오른쪽" },
  { key: "left", value: "왼쪽" },
  { key: "straight", value: "직진" },
  { key: "near", value: "가까운" },
  { key: "far", value: "먼" },
  { key: "Wi-Fi", value: "와이파이" },
  { key: "password", value: "비밀번호" },
  { key: "charger", value: "충전기" },
  { key: "adapter", value: "어댑터" },
  { key: "restroom", value: "화장실" },
  { key: "information", value: "안내소 / 정보" }
];

const sampleSentences = [
  { key: "Could you tell me where the check-in counter is?", value: "체크인 카운터가 어디인지 알려주실 수 있나요?" },
  { key: "I’d like to check in for my flight.", value: "항공편 체크인을 하고 싶습니다." },
  { key: "Can I choose an aisle seat?", value: "통로 쪽 좌석을 선택할 수 있나요?" },
  { key: "Can I choose a window seat?", value: "창가 좌석을 선택할 수 있나요?" },
  { key: "Is there any extra charge for this seat?", value: "이 좌석은 추가 요금이 있나요?" },
  { key: "My luggage is over the weight limit.", value: "제 짐이 무게 제한을 초과했습니다." },
  { key: "How much is the excess baggage fee?", value: "초과 수하물 요금이 얼마인가요?" },
  { key: "Can I carry this on board?", value: "이것을 기내에 가지고 탈 수 있나요?" },
  { key: "Where should I go for security screening?", value: "보안 검색은 어디로 가야 하나요?" },
  { key: "Could you help me find my boarding gate?", value: "탑승구 찾는 것을 도와주실 수 있나요?" },
  { key: "Has boarding started yet?", value: "탑승이 이미 시작되었나요?" },
  { key: "Has the gate changed?", value: "탑승구가 변경되었나요?" },
  { key: "How long is the flight delayed?", value: "항공편이 얼마나 지연되나요?" },
  { key: "What should I do if my flight is cancelled?", value: "항공편이 취소되면 어떻게 해야 하나요?" },
  { key: "I have a connecting flight.", value: "저는 환승 항공편이 있습니다." },
  { key: "Will I have enough time to transfer?", value: "환승할 시간이 충분할까요?" },
  { key: "Do I need to pick up my luggage here?", value: "여기서 짐을 찾아야 하나요?" },
  { key: "My baggage has not arrived.", value: "제 수하물이 도착하지 않았습니다." },
  { key: "I’d like to report missing luggage.", value: "분실 수하물을 신고하고 싶습니다." },
  { key: "This suitcase looks damaged.", value: "이 여행가방이 파손된 것 같습니다." },
  { key: "I’m here for tourism.", value: "관광 목적으로 왔습니다." },
  { key: "I’ll be staying for seven days.", value: "7일 동안 머물 예정입니다." },
  { key: "I’m staying at this hotel.", value: "이 호텔에 머물고 있습니다." },
  { key: "Here is my hotel reservation.", value: "여기 제 호텔 예약 확인서입니다." },
  { key: "I have a return ticket.", value: "돌아가는 항공권이 있습니다." },
  { key: "I don’t have anything to declare.", value: "신고할 물품이 없습니다." },
  { key: "This is for personal use.", value: "이것은 개인용입니다." },
  { key: "Could you repeat the question?", value: "질문을 다시 말씀해 주실 수 있나요?" },
  { key: "Could you write that down for me?", value: "그것을 적어 주실 수 있나요?" },
  { key: "I’m not sure what this form means.", value: "이 양식의 의미를 잘 모르겠습니다." },
  { key: "I have a reservation under the name Kim.", value: "Kim이라는 이름으로 예약했습니다." },
  { key: "Could you check my reservation?", value: "제 예약을 확인해 주실 수 있나요?" },
  { key: "Is breakfast included?", value: "조식이 포함되어 있나요?" },
  { key: "Is there a deposit required?", value: "보증금이 필요한가요?" },
  { key: "Can I check in early?", value: "일찍 체크인할 수 있나요?" },
  { key: "Can I check out late?", value: "늦게 체크아웃할 수 있나요?" },
  { key: "Could you keep my luggage until tonight?", value: "오늘 밤까지 짐을 맡아 주실 수 있나요?" },
  { key: "My room key isn’t working.", value: "제 방 키가 작동하지 않습니다." },
  { key: "The air conditioner doesn’t seem to work.", value: "에어컨이 작동하지 않는 것 같습니다." },
  { key: "There is no hot water in the room.", value: "방에 따뜻한 물이 나오지 않습니다." },
  { key: "The room hasn’t been cleaned yet.", value: "방이 아직 청소되지 않았습니다." },
  { key: "Could I change to another room?", value: "다른 방으로 바꿀 수 있을까요?" },
  { key: "The room is noisier than I expected.", value: "방이 생각보다 시끄럽습니다." },
  { key: "Could you send someone to fix it?", value: "수리할 사람을 보내 주실 수 있나요?" },
  { key: "What time does breakfast start?", value: "조식은 몇 시에 시작하나요?" },
  { key: "What time does the front desk close?", value: "프런트 데스크는 몇 시에 닫나요?" },
  { key: "Is there a laundry room in the hotel?", value: "호텔에 세탁실이 있나요?" },
  { key: "Could you call a taxi for me?", value: "택시를 불러 주실 수 있나요?" },
  { key: "What is the best way to get downtown?", value: "시내로 가는 가장 좋은 방법은 무엇인가요?" },
  { key: "Which line should I take?", value: "어느 노선을 타야 하나요?" },
  { key: "Where should I transfer?", value: "어디에서 갈아타야 하나요?" },
  { key: "How many stops is it from here?", value: "여기서 몇 정거장인가요?" },
  { key: "Does this train go to the airport?", value: "이 기차가 공항으로 가나요?" },
  { key: "Is this bus going in the right direction?", value: "이 버스가 맞는 방향으로 가고 있나요?" },
  { key: "Could you let me know when to get off?", value: "언제 내려야 하는지 알려주실 수 있나요?" },
  { key: "How often does this bus run?", value: "이 버스는 얼마나 자주 오나요?" },
  { key: "Where can I buy a transportation card?", value: "교통카드는 어디서 살 수 있나요?" },
  { key: "Can I top up this card here?", value: "여기서 이 카드를 충전할 수 있나요?" },
  { key: "I think I took the wrong train.", value: "제가 기차를 잘못 탄 것 같습니다." },
  { key: "Could you show me on the map?", value: "지도에서 보여주실 수 있나요?" },
  { key: "I’d like a table for two, if available.", value: "가능하면 두 명 자리를 부탁드립니다." },
  { key: "Do I need a reservation?", value: "예약이 필요한가요?" },
  { key: "How long is the wait?", value: "대기 시간이 얼마나 되나요?" },
  { key: "Could we sit by the window?", value: "창가 자리에 앉을 수 있을까요?" },
  { key: "What is the most popular dish here?", value: "여기서 가장 인기 있는 음식은 무엇인가요?" },
  { key: "Could you recommend something local?", value: "현지 음식을 추천해 주실 수 있나요?" },
  { key: "Does this contain seafood?", value: "이 음식에 해산물이 들어가나요?" },
  { key: "I’m allergic to nuts.", value: "저는 견과류 알레르기가 있습니다." },
  { key: "Could you make it less spicy?", value: "덜 맵게 해주실 수 있나요?" },
  { key: "Could you serve the sauce separately?", value: "소스를 따로 주실 수 있나요?" },
  { key: "I think this is not what I ordered.", value: "제가 주문한 것이 아닌 것 같습니다." },
  { key: "We haven’t received our order yet.", value: "저희 주문이 아직 나오지 않았습니다." },
  { key: "Could I have the bill, please?", value: "계산서를 받을 수 있을까요?" },
  { key: "Is service charge included?", value: "서비스 요금이 포함되어 있나요?" },
  { key: "Can we pay separately?", value: "따로 계산할 수 있나요?" },
  { key: "Could you pack this to go?", value: "이것을 포장해 주실 수 있나요?" },
  { key: "I’m looking for something under 30 dollars.", value: "30달러 이하의 물건을 찾고 있습니다." },
  { key: "Do you have a smaller size?", value: "더 작은 사이즈가 있나요?" },
  { key: "Do you have a larger size?", value: "더 큰 사이즈가 있나요?" },
  { key: "Can I return this if it doesn’t fit?", value: "사이즈가 안 맞으면 반품할 수 있나요?" },
  { key: "What is your return policy?", value: "반품 규정이 어떻게 되나요?" },
  { key: "Is this price final?", value: "이 가격이 최종 가격인가요?" },
  { key: "Could you give me a better price?", value: "조금 더 좋은 가격으로 해주실 수 있나요?" },
  { key: "I’ll think about it and come back later.", value: "생각해 보고 나중에 다시 오겠습니다." },
  { key: "Could you show me another one?", value: "다른 것도 보여주실 수 있나요?" },
  { key: "I’d like to exchange this item.", value: "이 물건을 교환하고 싶습니다." },
  { key: "I think I was charged twice.", value: "두 번 결제된 것 같습니다." },
  { key: "The card payment didn’t go through.", value: "카드 결제가 처리되지 않았습니다." },
  { key: "Could you cancel this transaction?", value: "이 결제를 취소해 주실 수 있나요?" },
  { key: "I need to contact my bank.", value: "은행에 연락해야 합니다." },
  { key: "I lost my passport and need help.", value: "여권을 잃어버려서 도움이 필요합니다." },
  { key: "Where is the nearest police station?", value: "가장 가까운 경찰서가 어디인가요?" },
  { key: "I’d like to file a police report.", value: "경찰 신고서를 작성하고 싶습니다." },
  { key: "My phone was stolen.", value: "제 휴대폰을 도난당했습니다." },
  { key: "I need to contact the Korean embassy.", value: "한국 대사관에 연락해야 합니다." },
  { key: "I don’t feel well and need a doctor.", value: "몸이 좋지 않아 의사가 필요합니다." },
  { key: "Is there a hospital nearby?", value: "근처에 병원이 있나요?" },
  { key: "I need medicine for a cold.", value: "감기약이 필요합니다." },
  { key: "Could you explain how to take this medicine?", value: "이 약을 어떻게 복용하는지 설명해 주실 수 있나요?" },
  { key: "Could you help me make an international call?", value: "국제전화를 거는 것을 도와주실 수 있나요?" }
];

const legacySampleKeys = new Set(["apple", "book", "study", "remember", "listen", "answer"]);

const emptyProfile: ProfileSummary = {
  cumulativeLearningDays: 0,
  todayStudiedCount: 0,
  memorizedWordCount: 0,
  memorizedWords: [],
  recentWordbooks: []
};

interface DraftRow {
  question: string;
  answer: string;
}

type HomeView = "study" | "edit" | "profile";
type ReviewState = "question" | "again-reveal" | "hard-reveal" | "good-reveal";
type SheetColumn = "question" | "answer";
type EditWorkspaceMode = "sheet" | "export";
type ImportSource = "local" | "google-drive";
type PasswordAuthMode = "login" | "register";

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
}

interface GoogleTokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
  error_callback?: (error: unknown) => void;
}

interface GooglePickerDocument {
  id: string;
  name: string;
  mimeType: string;
}

interface GooglePickerData {
  action?: string;
  docs?: GooglePickerDocument[];
}

interface GooglePickerBuilder {
  setAppId(appId: string): GooglePickerBuilder;
  setOAuthToken(token: string): GooglePickerBuilder;
  setDeveloperKey(key: string): GooglePickerBuilder;
  addView(view: unknown): GooglePickerBuilder;
  setCallback(callback: (data: GooglePickerData) => void): GooglePickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

interface GooglePickerView {
  setMimeTypes(mimeTypes: string): GooglePickerView;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize(config: { client_id: string; callback: (response: { credential?: string }) => void }): void;
          prompt(): void;
        };
        oauth2?: {
          initTokenClient(config: GoogleTokenClientConfig): GoogleTokenClient;
        };
      };
      picker?: {
        Action: { PICKED: string; CANCEL: string };
        DocsView: new () => GooglePickerView;
        PickerBuilder: new () => GooglePickerBuilder;
      };
    };
    gapi?: {
      load(api: string, options: { callback: () => void; onerror?: () => void }): void;
    };
  }
}

interface SheetSelection {
  rowId: string;
  column: SheetColumn;
}

interface ImportValidation {
  count: number;
  error: string;
}

function createDraftRows(count = DRAFT_ROW_COUNT): DraftRow[] {
  return Array.from({ length: count }, () => ({ question: "", answer: "" }));
}

function studyTextClassName(baseClassName: string, text: string): string {
  return text.length >= COMPACT_STUDY_TEXT_LENGTH ? `${baseClassName} compact-study-text` : baseClassName;
}

function hasGoogleDriveConfig(): boolean {
  return Boolean(googleDriveConfig.clientId && googleDriveConfig.apiKey && googleDriveConfig.appId);
}

function hasGoogleLoginConfig(): boolean {
  return Boolean(googleDriveConfig.clientId);
}

function sanitizeFileName(name: string): string {
  const sanitized = name.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ");
  return sanitized || "wordbook";
}

function wordbookNameFromFileName(fileName: string): string {
  return fileName.replace(/\.(md|markdown|txt)$/i, "").trim() || `가져온 암기장 ${new Date().toLocaleString()}`;
}

function validateMarkdownImport(markdownText: string): ImportValidation {
  if (!markdownText.trim()) {
    return { count: 0, error: "가져올 Markdown을 입력하거나 파일을 선택하세요." };
  }

  try {
    const parsed = parseWordMarkdown(markdownText);
    if (parsed.length === 0) {
      return { count: 0, error: "가져올 단어가 없습니다." };
    }
    return { count: parsed.length, error: "" };
  } catch (error) {
    return { count: 0, error: error instanceof Error ? error.message : "Markdown을 읽지 못했습니다." };
  }
}

function loadScriptOnce(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`${id} script load failed`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`${id} script load failed`));
    document.head.appendChild(script);
  });
}

async function loadGoogleDrivePickerApi(): Promise<void> {
  await Promise.all([
    loadScriptOnce(GOOGLE_IDENTITY_SCRIPT_URL, "google-identity-services"),
    loadScriptOnce(GOOGLE_PICKER_SCRIPT_URL, "google-picker-api")
  ]);

  await new Promise<void>((resolve, reject) => {
    if (!window.gapi) {
      reject(new Error("Google API 클라이언트를 불러오지 못했습니다."));
      return;
    }
    window.gapi.load("picker", {
      callback: resolve,
      onerror: () => reject(new Error("Google Picker를 불러오지 못했습니다."))
    });
  });
}

function requestGoogleAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      reject(new Error("Google 로그인 모듈을 불러오지 못했습니다."));
      return;
    }

    const tokenClient = oauth2.initTokenClient({
      client_id: googleDriveConfig.clientId,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error || "Google Drive 접근 권한을 받지 못했습니다."));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: reject
    });
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

function openGoogleDrivePicker(accessToken: string): Promise<GooglePickerDocument | null> {
  return new Promise((resolve, reject) => {
    const picker = window.google?.picker;
    if (!picker) {
      reject(new Error("Google Picker를 사용할 수 없습니다."));
      return;
    }

    const view = new picker.DocsView();
    view.setMimeTypes("text/markdown,text/plain,application/vnd.google-apps.document");
    new picker.PickerBuilder()
      .setAppId(googleDriveConfig.appId)
      .setOAuthToken(accessToken)
      .setDeveloperKey(googleDriveConfig.apiKey)
      .addView(view)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) {
          resolve(data.docs?.[0] ?? null);
        }
        if (data.action === picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build()
      .setVisible(true);
  });
}

async function readGoogleDriveFileText(file: GooglePickerDocument, accessToken: string): Promise<string> {
  const encodedFileId = encodeURIComponent(file.id);
  const url = file.mimeType.startsWith("application/vnd.google-apps.")
    ? `https://www.googleapis.com/drive/v3/files/${encodedFileId}/export?mimeType=text/plain`
    : `https://www.googleapis.com/drive/v3/files/${encodedFileId}?alt=media`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new Error("Google Drive 파일을 읽지 못했습니다.");
  }
  return response.text();
}

function getDemoUsername(): string {
  const storedUsername = localStorage.getItem(DEMO_USERNAME_KEY);
  if (storedUsername) {
    return storedUsername;
  }

  const username = `demo-${Date.now()}`;
  localStorage.setItem(DEMO_USERNAME_KEY, username);
  return username;
}

function updateWordbookWords(wordbooks: Wordbook[], wordbookId: string, updater: (words: Word[]) => Word[]): Wordbook[] {
  return wordbooks.map((wordbook) =>
    wordbook.id === wordbookId ? { ...wordbook, words: updater(wordbook.words), updatedAt: new Date().toISOString() } : wordbook
  );
}

function createClientEventId(cardId: string, rating: ReviewRating): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `web-${cardId}-${rating}-${randomId}`;
}

function isLegacySampleWordbook(wordbook: Wordbook): boolean {
  return (
    wordbook.name === LEGACY_SAMPLE_WORDBOOK_NAME &&
    (wordbook.words.length === 0 || wordbook.words.every((word) => legacySampleKeys.has(word.key)))
  );
}

export function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [mistakeCards, setMistakeCards] = useState<MistakeCard[]>([]);
  const [summary, setSummary] = useState<ProfileSummary>(emptyProfile);
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAuthMode, setPasswordAuthMode] = useState<PasswordAuthMode>("login");
  const [authError, setAuthError] = useState("");
  const [wordbooks, setWordbooks] = useState<Wordbook[]>([]);
  const [activeWordbookId, setActiveWordbookId] = useState("");
  const [newWordbookName, setNewWordbookName] = useState("");
  const [editingWordbookName, setEditingWordbookName] = useState("");
  const [draftRows, setDraftRows] = useState<DraftRow[]>(() => createDraftRows());
  const [markdown, setMarkdown] = useState("");
  const [message, setMessage] = useState("");
  const [editMode, setEditMode] = useState<EditWorkspaceMode>("sheet");
  const [importSource, setImportSource] = useState<ImportSource>("local");
  const [importWordbookName, setImportWordbookName] = useState("");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [googleDriveLoading, setGoogleDriveLoading] = useState(false);
  const [session, setSession] = useState<StudySession | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState>("question");
  const [studyQueueLoading, setStudyQueueLoading] = useState(false);
  const [selectedCell, setSelectedCell] = useState<SheetSelection | null>(null);
  const [homeView, setHomeView] = useState<HomeView>("study");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [appError, setAppError] = useState("");
  const [loading, setLoading] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const speechDriver = useMemo(() => createBrowserSpeechDriver(), []);

  const activeWordbook = wordbooks.find((wordbook) => wordbook.id === activeWordbookId) ?? wordbooks[0] ?? null;
  const currentCard = session ? getCurrentCard(session) : null;
  const speechAvailable = speechDriver.isAvailable();
  const importValidation = useMemo(() => validateMarkdownImport(markdown), [markdown]);
  const googleLoginAvailable = hasGoogleLoginConfig();
  useEffect(() => {
    if (!speechEnabled || homeView !== "study" || !session || !currentCard) {
      return undefined;
    }

    const text = session.revealed ? currentCard.answer : currentCard.prompt;
    void speechDriver.speak(text, {
      lang: detectSpeechLanguage(text),
      rate: 0.92
    });

    return () => {
      speechDriver.stop();
    };
  }, [
    currentCard?.answer,
    currentCard?.direction,
    currentCard?.prompt,
    currentCard?.word.id,
    homeView,
    session?.index,
    session?.revealed,
    session,
    speechDriver,
    speechEnabled
  ]);

  async function createWordbookWithWords(name: string, wordsToCreate: Array<Pick<Word, "key" | "value">>): Promise<Wordbook> {
    const wordbook = await apiClient.createWordbook(name);
    const words = await apiClient.batchWords(wordbook.id, wordsToCreate);
    return { ...wordbook, words };
  }

  async function createDefaultSampleWordbooks(): Promise<Wordbook[]> {
    return [
      await createWordbookWithWords(SAMPLE_WORDBOOK_NAME, sampleWords),
      await createWordbookWithWords(SAMPLE_SENTENCE_WORDBOOK_NAME, sampleSentences)
    ];
  }

  async function ensureSentenceSampleWordbook(loadedWordbooks: Wordbook[]): Promise<Wordbook[]> {
    if (loadedWordbooks.some((wordbook) => wordbook.name === SAMPLE_SENTENCE_WORDBOOK_NAME)) {
      return loadedWordbooks;
    }
    return [...loadedWordbooks, await createWordbookWithWords(SAMPLE_SENTENCE_WORDBOOK_NAME, sampleSentences)];
  }

  async function replaceLegacySampleWordbook(loadedWordbooks: Wordbook[]): Promise<Wordbook[]> {
    const legacyWordbook = loadedWordbooks.find(isLegacySampleWordbook);
    if (!legacyWordbook) {
      return loadedWordbooks;
    }

    const existingTravelSample = loadedWordbooks.find((wordbook) => wordbook.id !== legacyWordbook.id && wordbook.name === SAMPLE_WORDBOOK_NAME);
    if (existingTravelSample) {
      await apiClient.deleteWordbook(legacyWordbook.id);
      return loadedWordbooks.filter((wordbook) => wordbook.id !== legacyWordbook.id);
    }

    for (const word of legacyWordbook.words) {
      await apiClient.deleteWord(word.id);
    }

    const renamed = await apiClient.renameWordbook(legacyWordbook.id, SAMPLE_WORDBOOK_NAME);
    const words = await apiClient.batchWords(legacyWordbook.id, sampleWords);
    return loadedWordbooks.map((wordbook) => (wordbook.id === legacyWordbook.id ? { ...renamed, words } : wordbook));
  }

  const loadWordbooks = useCallback(async () => {
    let loaded = await apiClient.syncPull(0);
    if (loaded.length === 0) {
      loaded = await createDefaultSampleWordbooks();
    } else {
      loaded = await replaceLegacySampleWordbook(loaded);
      loaded = await ensureSentenceSampleWordbook(loaded);
    }
    setWordbooks(loaded);
    setActiveWordbookId((current) => current || loaded[0]?.id || "");
    setEditingWordbookName((current) => current || loaded[0]?.name || "");
  }, []);

  const loadSummary = useCallback(async () => {
    setSummary(await apiClient.profileSummary());
  }, []);

  const loadMistakes = useCallback(async () => {
    setMistakeCards(await apiClient.studyMistakes(undefined, 10));
  }, []);

  const loadAfterAuth = useCallback(async () => {
    setLoading(true);
    setAppError("");
    try {
      await Promise.all([loadWordbooks(), loadSummary(), loadMistakes()]);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [loadMistakes, loadSummary, loadWordbooks]);

  useEffect(() => {
    if (!apiClient.hasToken()) {
      return;
    }

    void apiClient
      .me()
      .then((user) => {
        setProfile(user);
        return loadAfterAuth();
      })
      .catch(() => {
        setProfile(null);
      });
  }, [loadAfterAuth]);

  useEffect(() => {
    if (!profile || !apiClient.hasToken()) {
      return;
    }

    window.postMessage(
      {
        source: "memory-note-web",
        type: "MEMORY_NOTE_AUTH_TOKEN",
        token: apiClient.getToken(),
        apiBaseUrl: apiClient.getApiBaseUrl()
      },
      window.location.origin
    );
  }, [profile]);

  function resetStudySession() {
    setSession(null);
    setReviewState("question");
  }

  function selectSheetCell(rowId: string, column: SheetColumn) {
    setSelectedCell({ rowId, column });
  }

  function sheetCellClass(rowId: string, column: SheetColumn, extraClass = "") {
    return ["sheet-cell", "selectable-cell", selectedCell?.rowId === rowId && selectedCell.column === column ? "selected-cell" : "", extraClass]
      .filter(Boolean)
      .join(" ");
  }

  useEffect(() => {
    let cancelled = false;

    if (!activeWordbook || activeWordbook.words.length === 0) {
      resetStudySession();
      return () => {
        cancelled = true;
      };
    }

    async function loadStudyQueue() {
      setStudyQueueLoading(true);
      try {
        const today = await apiClient.studyToday(activeWordbook.id, Math.max(20, activeWordbook.words.length * 2));
        if (cancelled) {
          return;
        }
        setSession(today.cards.length > 0 ? createStudySessionFromCards(today.cards) : createStudySession(activeWordbook.words));
      } catch {
        if (!cancelled) {
          setSession(createStudySession(activeWordbook.words));
        }
      } finally {
        if (!cancelled) {
          setReviewState("question");
          setStudyQueueLoading(false);
        }
      }
    }

    void loadStudyQueue();

    return () => {
      cancelled = true;
    };
  }, [activeWordbook?.id, activeWordbook?.words.length]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    const enteredUsername = loginName.trim();
    const username = enteredUsername.length >= 3 ? enteredUsername : passwordAuthMode === "register" ? "" : getDemoUsername();
    const loginPassword = password.length >= 8 ? password : passwordAuthMode === "register" ? "" : DEMO_PASSWORD;

    if (!username || !loginPassword) {
      setAuthError("아이디는 3자 이상, 비밀번호는 8자 이상 입력하세요.");
      return;
    }

    setAuthError("");
    try {
      const user =
        passwordAuthMode === "register"
          ? await apiClient.register({ username, password: loginPassword })
          : await apiClient.login({ username, password: loginPassword });
      setProfile(user);
      await loadAfterAuth();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : passwordAuthMode === "register" ? "가입에 실패했습니다." : "로그인에 실패했습니다.");
    }
  }

  async function handleGoogleCredential(idToken: string) {
    setAuthError("");
    try {
      const user = await apiClient.loginWithGoogle(idToken);
      setProfile(user);
      await loadAfterAuth();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Google 로그인에 실패했습니다.");
    }
  }

  async function handleGoogleLogin() {
    const clientId = googleDriveConfig.clientId;
    if (!clientId) {
      setAuthError("Google 로그인을 사용하려면 VITE_GOOGLE_CLIENT_ID 설정이 필요합니다. 개발 중에는 아래 개발용 시작하기를 사용할 수 있습니다.");
      return;
    }

    try {
      await loadScriptOnce(GOOGLE_IDENTITY_SCRIPT_URL, "google-identity-services");
      const googleId = window.google?.accounts?.id;
      if (!googleId) {
        setAuthError("Google 로그인 모듈을 불러오지 못했습니다.");
        return;
      }
      googleId.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) {
            void handleGoogleCredential(response.credential);
          }
        }
      });
      googleId.prompt();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Google 로그인을 시작하지 못했습니다.");
    }
  }

  async function handleLogout() {
    await apiClient.logout();
    setProfile(null);
    setWordbooks([]);
    setSummary(emptyProfile);
    resetStudySession();
  }

  async function handleCreateWordbook(event: FormEvent) {
    event.preventDefault();
    const name = newWordbookName.trim();
    if (!name) {
      return;
    }

    const created = await apiClient.createWordbook(name);
    setWordbooks((current) => [created, ...current]);
    setActiveWordbookId(created.id);
    setEditingWordbookName(created.name);
    setSelectedCell(null);
    setNewWordbookName("");
    setDraftRows(createDraftRows());
    setMarkdown("");
    setImportWordbookName("");
    setImportModalOpen(false);
    setEditMode("sheet");
    setHomeView("edit");
    resetStudySession();
  }

  async function handleRenameWordbook(event: FormEvent) {
    event.preventDefault();
    const name = editingWordbookName.trim();
    if (!activeWordbook || !name) {
      return;
    }

    const updated = await apiClient.renameWordbook(activeWordbook.id, name);
    setWordbooks((current) => current.map((wordbook) => (wordbook.id === updated.id ? { ...wordbook, ...updated, words: wordbook.words } : wordbook)));
  }

  async function handleDeleteWordbook(id: string) {
    await apiClient.deleteWordbook(id);
    setWordbooks((current) => {
      const next = current.filter((wordbook) => wordbook.id !== id);
      setActiveWordbookId(next[0]?.id ?? "");
      setEditingWordbookName(next[0]?.name ?? "");
      setMarkdown("");
      setImportWordbookName("");
      setImportModalOpen(false);
      setEditMode("sheet");
      return next;
    });
    resetStudySession();
    await loadSummary();
  }

  function selectWordbook(wordbook: Wordbook) {
    setActiveWordbookId(wordbook.id);
    setEditingWordbookName(wordbook.name);
    setDraftRows(createDraftRows());
    setSelectedCell(null);
    setMarkdown("");
    setImportWordbookName("");
    setImportModalOpen(false);
    setEditMode("sheet");
    resetStudySession();
  }

  function updateDraftRow(index: number, field: keyof DraftRow, value: string) {
    setDraftRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  }

  function clearDraftRow(index: number) {
    setDraftRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { question: "", answer: "" } : row)));
    setSelectedCell(null);
  }

  function addDraftRows(count = 4) {
    setDraftRows((current) => [...current, ...createDraftRows(count)]);
  }

  function handleDraftPaste(event: ClipboardEvent<HTMLInputElement>, startIndex: number, field: keyof DraftRow) {
    const text = event.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) {
      return;
    }

    event.preventDefault();
    const pastedRows = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => line.split("\t").map((cell) => cell.trim()));

    setDraftRows((current) => {
      const next = [...current];
      while (next.length < startIndex + pastedRows.length) {
        next.push({ question: "", answer: "" });
      }

      pastedRows.forEach((cells, offset) => {
        const row = { ...next[startIndex + offset] };
        if (field === "question") {
          row.question = cells[0] ?? row.question;
          row.answer = cells[1] ?? row.answer;
        } else {
          row.answer = cells[0] ?? row.answer;
        }
        next[startIndex + offset] = row;
      });

      return next;
    });
  }

  async function handleSaveDraftRows() {
    if (!activeWordbook) {
      return;
    }

    const entries = draftRows
      .map((row) => ({ key: row.question.trim(), value: row.answer.trim() }))
      .filter((row) => row.key.length > 0 && row.value.length > 0);

    if (entries.length === 0) {
      setMessage("추가할 질문과 답변을 입력하세요.");
      return;
    }

    const saved = await apiClient.batchWords(activeWordbook.id, entries);
    const refreshed = await apiClient.listWords(activeWordbook.id);
    setWordbooks((current) => updateWordbookWords(current, activeWordbook.id, () => refreshed));
    setDraftRows(createDraftRows());
    setSelectedCell(null);
    setMessage(`${saved.length}개 단어를 저장했습니다.`);
    resetStudySession();
  }

  async function handleAddSampleWords() {
    if (!activeWordbook) {
      return;
    }
    await apiClient.batchWords(activeWordbook.id, sampleWords);
    const refreshed = await apiClient.listWords(activeWordbook.id);
    setWordbooks((current) => updateWordbookWords(current, activeWordbook.id, () => refreshed));
    setMessage("암기 노트 기본 단어 100개를 넣었습니다.");
    resetStudySession();
  }

  async function handleDeleteWord(wordId: string) {
    await apiClient.deleteWord(wordId);
    if (!activeWordbook) {
      return;
    }
    setWordbooks((current) => updateWordbookWords(current, activeWordbook.id, (words) => words.filter((word) => word.id !== wordId)));
    setSelectedCell(null);
    resetStudySession();
  }

  function openSheetMode() {
    setEditMode("sheet");
    setMarkdown("");
    setImportWordbookName("");
    setImportModalOpen(false);
    setSelectedCell(null);
  }

  function openExportMode() {
    if (!activeWordbook) {
      return;
    }
    setMarkdown(serializeWordsToMarkdown(activeWordbook.words));
    setEditMode("export");
    setImportWordbookName("");
    setImportModalOpen(false);
    setSelectedCell(null);
    setMessage("현재 단어장을 내보내기 형식으로 표시했습니다.");
  }

  function openImportMode() {
    setImportModalOpen(true);
    setImportSource("local");
    setMarkdown("");
    setImportWordbookName("");
    setSelectedCell(null);
    setMessage("");
  }

  function closeImportModal() {
    setImportModalOpen(false);
    setMarkdown("");
    setImportWordbookName("");
    setImportSource("local");
    setGoogleDriveLoading(false);
  }

  function downloadMarkdownFile() {
    if (!activeWordbook) {
      return;
    }

    const blob = new Blob([markdown || serializeWordsToMarkdown(activeWordbook.words)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeFileName(activeWordbook.name)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setMessage("Markdown 파일을 다운로드했습니다.");
  }

  async function handleLocalFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      setMarkdown(text);
      setImportWordbookName(wordbookNameFromFileName(file.name));
      setMessage(`${file.name} 파일을 불러왔습니다.`);
    } catch {
      setMessage("로컬 파일을 읽지 못했습니다.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleGoogleDrivePick() {
    if (!hasGoogleDriveConfig()) {
      setMessage("Google Drive를 열려면 Google Cloud OAuth/API 설정이 필요합니다. `.env`에 Google Drive 값을 추가한 뒤 개발 서버를 다시 시작하세요.");
      return;
    }

    setGoogleDriveLoading(true);
    try {
      await loadGoogleDrivePickerApi();
      const accessToken = await requestGoogleAccessToken();
      const file = await openGoogleDrivePicker(accessToken);
      if (!file) {
        setMessage("Google Drive 파일 선택을 취소했습니다.");
        return;
      }
      const text = await readGoogleDriveFileText(file, accessToken);
      setMarkdown(text);
      setImportWordbookName(wordbookNameFromFileName(file.name));
      setMessage(`${file.name} 파일을 Google Drive에서 불러왔습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google Drive 파일을 가져오지 못했습니다.");
    } finally {
      setGoogleDriveLoading(false);
    }
  }

  async function createWordbookFromMarkdown() {
    try {
      const parsed = parseWordMarkdown(markdown);
      if (parsed.length === 0) {
        setMessage("가져올 단어가 없습니다.");
        return;
      }

      const name = importWordbookName.trim() || `가져온 암기장 ${new Date().toLocaleString()}`;
      const created = await apiClient.createWordbook(name);
      const words = await apiClient.batchWords(created.id, parsed);
      const nextWordbook = { ...created, words };
      setWordbooks((current) => [nextWordbook, ...current]);
      setActiveWordbookId(nextWordbook.id);
      setEditingWordbookName(nextWordbook.name);
      setDraftRows(createDraftRows());
      setSelectedCell(null);
      setMarkdown("");
      setImportWordbookName("");
      setImportModalOpen(false);
      setEditMode("sheet");
      setMessage(`${words.length}개 단어로 새 암기장을 만들었습니다.`);
      resetStudySession();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "새 암기장을 만들지 못했습니다.");
    }
  }

  function goNextCard() {
    setSession((current) => (current ? nextCard(current) : current));
    setReviewState("question");
  }

  function handleToggleSpeech() {
    if (!speechAvailable) {
      return;
    }

    setSpeechEnabled((enabled) => {
      const nextEnabled = !enabled;
      if (!nextEnabled) {
        speechDriver.stop();
      }
      return nextEnabled;
    });
  }

  async function saveStudyResult(rating: ReviewRating) {
    if (!currentCard) {
      return;
    }

    if (currentCard.cardId) {
      const result = await apiClient.reviewCard(currentCard.cardId, {
        rating,
        platform: StudyPlatform.WEB,
        clientEventId: createClientEventId(currentCard.cardId, rating)
      });
      const viewedAt = result.lastReviewedAt ?? new Date().toISOString();
      if (result.legacyWordId) {
        setWordbooks((current) =>
          updateWordbookWords(current, result.wordbookId, (words) => markCurrentViewed(words, result.legacyWordId!, viewedAt))
        );
      }
      await loadSummary();
      return;
    }

    if (!activeWordbook) {
      return;
    }
    const updated = await apiClient.studyWord(currentCard.word.id, rating === "AGAIN" ? "unknown" : "known", {
      cardType: currentCard.cardType ?? cardTypeFromDirection(currentCard.direction),
      platform: StudyPlatform.WEB,
      clientEventId: createClientEventId(currentCard.word.id, rating)
    });
    setWordbooks((current) =>
      updateWordbookWords(current, activeWordbook.id, (words) => words.map((word) => (word.id === updated.id ? updated : word)))
    );
    await loadSummary();
  }

  function handleReview(rating: ReviewRating, revealState: Exclude<ReviewState, "question">) {
    if (!currentCard) {
      return;
    }
    if (reviewState === revealState) {
      void saveStudyResult(rating).then(goNextCard);
      return;
    }
    if (reviewState !== "question") {
      return;
    }
    setSession((current) => (current ? revealCurrent(current) : current));
    setReviewState(revealState);
  }

  function isReviewButtonDisabled(revealState: Exclude<ReviewState, "question">): boolean {
    return reviewState !== "question" && reviewState !== revealState;
  }

  if (!profile) {
    return (
      <main className="login-screen">
        <section className="login-layout" aria-label="암기 노트 시작하기">
          <section className="login-hero" aria-label="서비스 소개">
            <div className="login-brand">
              <span className="brand-mark"><BookOpen size={20} /></span>
              <span>암기 노트</span>
            </div>
            <div className="login-copy">
              <h1>
                <span>가장 쉬운 암기 방법.</span>
                <span>무료로 시작하세요.</span>
              </h1>
              <p>암기를 위한 노트를 계정에 저장하고 어디서든 이어서 학습하세요.</p>
            </div>
            <ul className="login-benefits" aria-label="주요 기능">
              <li><Check size={16} /> 단어장과 문장을 계정에 저장</li>
              <li><Check size={16} /> 질문과 답을 번갈아 보며 암기</li>
              <li><Check size={16} /> Markdown 가져오기와 내보내기 지원</li>
            </ul>
          </section>

          <form className="login-panel" onSubmit={handleLogin} aria-label="로그인">
            <div className="password-auth-tabs" aria-label="가입 또는 로그인 선택">
              <button
                className={passwordAuthMode === "register" ? "active" : ""}
                type="button"
                onClick={() => {
                  setPasswordAuthMode("register");
                  setAuthError("");
                }}
              >
                가입
              </button>
              <button
                className={passwordAuthMode === "login" ? "active" : ""}
                type="button"
                onClick={() => {
                  setPasswordAuthMode("login");
                  setAuthError("");
                }}
              >
                로그인
              </button>
            </div>
            <div className="auth-heading">
              <p className="eyebrow">{passwordAuthMode === "register" ? "Create account" : "Welcome back"}</p>
              <h2>{passwordAuthMode === "register" ? "무료로 시작하기" : "다시 학습하기"}</h2>
              <p>{passwordAuthMode === "register" ? "계정을 만들고 기본 암기장을 바로 받아보세요." : "저장된 암기장과 학습 기록을 불러옵니다."}</p>
            </div>
            {googleLoginAvailable && (
              <>
                <button className="primary-button google-login-button" type="button" onClick={handleGoogleLogin}>
                  Google로 시작하기
                </button>
                <div className="login-divider">아이디로 계속하기</div>
              </>
            )}
            <label className="auth-field">
              아이디
              <input
                value={loginName}
                onChange={(event) => setLoginName(event.target.value)}
                autoComplete="username"
                placeholder="예: travel-learner"
              />
            </label>
            <label className="auth-field">
              비밀번호
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete={passwordAuthMode === "register" ? "new-password" : "current-password"}
                placeholder="8자 이상 입력"
              />
            </label>
            {authError && <p className="form-error">{authError}</p>}
            <button className="primary-button auth-submit" type="submit">{passwordAuthMode === "register" ? "가입하기" : "로그인하기"}</button>
            <p className="auth-note">{passwordAuthMode === "register" ? "가입 후 샘플 암기장 2개가 자동으로 생성됩니다." : "처음이라면 가입 탭에서 새 암기장을 시작하세요."}</p>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className={sidebarOpen ? "home-shell" : "home-shell sidebar-collapsed"}>
      <header className="top-nav">
        <div className="brand-area">
          <button className="icon-button" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? "암기장 목록 숨기기" : "암기장 목록 보이기"}>
            {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
          <strong>암기 노트</strong>
        </div>
        <nav className="main-tabs" aria-label="상단 메뉴">
          <button className={homeView === "study" ? "active" : ""} onClick={() => setHomeView("study")}>암기</button>
          <button className={homeView === "edit" ? "active" : ""} onClick={() => setHomeView("edit")}>단어장 편집</button>
          <button className={homeView === "profile" ? "active" : ""} onClick={() => setHomeView("profile")}>프로필</button>
        </nav>
        <div className="profile-chip">
          <span>{profile.displayName}</span>
          <button className="icon-button" onClick={handleLogout} aria-label="로그아웃" title="로그아웃">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <aside className="memory-sidebar" aria-label="암기장 목록">
        <section className="wordbook-create" aria-label="단어장 만들기">
          <h2>암기장</h2>
          <form className="create-row" onSubmit={handleCreateWordbook}>
            <input
              value={newWordbookName}
              onChange={(event) => setNewWordbookName(event.target.value)}
              placeholder="예: 토익 Day 1"
              aria-label="새 단어장 이름"
              disabled={loading}
            />
            <button className="icon-button" type="submit" aria-label="단어장 만들기" title="단어장 만들기" disabled={loading}>
              <Plus size={18} />
            </button>
          </form>
        </section>

        <nav className="wordbook-list" aria-label="단어장 목록">
          {wordbooks.map((wordbook) => (
            <button
              key={wordbook.id}
              className={wordbook.id === activeWordbook?.id ? "wordbook-item active" : "wordbook-item"}
              onClick={() => selectWordbook(wordbook)}
            >
              <BookOpen size={16} />
              <span>{wordbook.name}</span>
              <small>{wordbook.words.length}</small>
            </button>
          ))}
        </nav>
      </aside>

      <section className="home-content">
        {loading && <p className="status-line">불러오는 중...</p>}
        {studyQueueLoading && !loading && <p className="status-line">오늘 학습 큐를 준비하는 중...</p>}
        {appError && <p className="form-error">{appError}</p>}
        {homeView === "study" && (
          <section className="study-home" aria-label="암기 홈">
            <div className="study-header">
              <div>
                <p className="eyebrow">현재 암기장</p>
                <h1>{activeWordbook?.name ?? "암기장을 선택하세요"}</h1>
              </div>
            </div>

            <div className="notebook-stage">
              {currentCard ? (
                <article className="memory-card notebook-card" aria-label="단어 암기장">
                  <button
                    className={speechEnabled ? "icon-button speech-toggle notebook-speech-control active" : "icon-button speech-toggle notebook-speech-control"}
                    type="button"
                    onClick={handleToggleSpeech}
                    aria-label={speechEnabled ? "읽어주기 끄기" : "읽어주기 켜기"}
                    aria-pressed={speechEnabled}
                    title={speechAvailable ? (speechEnabled ? "읽어주기 끄기" : "읽어주기 켜기") : "이 브라우저는 읽어주기를 지원하지 않습니다."}
                    disabled={!speechAvailable}
                  >
                    {speechEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                  </button>
                  <section className="notebook-section notebook-question" aria-label="앞면">
                    <strong className={studyTextClassName("study-term", currentCard.prompt)}>{currentCard.prompt}</strong>
                  </section>
                  <section className={session?.revealed ? "notebook-section notebook-answer revealed" : "notebook-section notebook-answer"} aria-label="뒷면">
                    {session?.revealed ? <strong className={studyTextClassName("study-answer", currentCard.answer)}>{currentCard.answer}</strong> : null}
                  </section>
                </article>
              ) : (
                <article className="memory-card notebook-card empty-notebook" aria-label="단어 암기장">
                  <strong>{session ? "세션을 마쳤습니다." : "세션을 시작하세요."}</strong>
                </article>
              )}
            </div>

            <div className="study-actions">
              {session && currentCard && (
                <>
                  <button
                    className="ghost-button large-action"
                    onClick={() => handleReview(BASIC_REVIEW_RATING_BY_ACTION.again, "again-reveal")}
                    disabled={isReviewButtonDisabled("again-reveal")}
                  >
                    {reviewState === "again-reveal" ? "다음" : "모름"}
                  </button>
                  <button
                    className="ghost-button large-action"
                    onClick={() => handleReview(BASIC_REVIEW_RATING_BY_ACTION.hard, "hard-reveal")}
                    disabled={isReviewButtonDisabled("hard-reveal")}
                  >
                    {reviewState === "hard-reveal" ? "다음" : "힘들게 맞춤"}
                  </button>
                  <button
                    className="primary-button large-action"
                    onClick={() => handleReview(BASIC_REVIEW_RATING_BY_ACTION.good, "good-reveal")}
                    disabled={isReviewButtonDisabled("good-reveal")}
                  >
                    {reviewState === "good-reveal" ? "다음" : "바로 앎"}
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        {homeView === "edit" && activeWordbook && (
          <section className="edit-home" aria-label="단어장 편집">
            <header className="workspace-header">
              <form onSubmit={handleRenameWordbook} className="rename-form">
                <input
                  value={editingWordbookName || activeWordbook.name}
                  onChange={(event) => setEditingWordbookName(event.target.value)}
                  aria-label="단어장 이름"
                />
                <button className="icon-button" type="submit" aria-label="단어장 이름 저장" title="단어장 이름 저장">
                  <Check size={18} />
                </button>
              </form>
              <button className="danger-button" onClick={() => handleDeleteWordbook(activeWordbook.id)}>
                <Trash2 size={16} />
                삭제
              </button>
            </header>
            {message && <p className="status-line workspace-status">{message}</p>}

            <div className="edit-mode-tabs" aria-label="단어장 편집 작업">
              <button className={editMode === "sheet" ? "active" : ""} type="button" onClick={openSheetMode}>
                편집
              </button>
              <button className={editMode === "export" ? "active" : ""} type="button" onClick={openExportMode}>
                <Download size={16} />
                파일 내보내기
              </button>
              <button className={importModalOpen ? "active" : ""} type="button" onClick={openImportMode}>
                <Upload size={16} />
                파일 가져오기
              </button>
            </div>

            <div className="edit-grid">
              {editMode === "sheet" && (
                <section className="panel word-panel">
                  <div className="panel-heading excel-heading">
                    <div>
                      <p className="eyebrow">Workbook Sheet</p>
                      <h2>단어 편집</h2>
                    </div>
                    <span>{activeWordbook.words.length}개 저장됨</span>
                  </div>

                  <div className="word-entry-panel">
                    <div className="sheet-toolbar">
                      <p className="sheet-hint">엑셀에서 두 열을 복사한 뒤 첫 칸에 붙여넣을 수 있습니다.</p>
                      <div className="button-group">
                        <button className="ghost-button" type="button" onClick={() => addDraftRows()}>
                          <Plus size={16} />
                          줄 추가
                        </button>
                        <button className="ghost-button" type="button" onClick={handleAddSampleWords}>
                          샘플 넣기
                        </button>
                        <button className="primary-button" type="button" onClick={handleSaveDraftRows}>
                          단어 저장
                        </button>
                      </div>
                    </div>

                    <div className="sheet-grid excel-sheet" role="table" aria-label="단어 추가 및 삭제표">
                      <div className="sheet-row sheet-columns" role="row">
                        <span />
                        <span>A</span>
                        <span>B</span>
                        <span>C</span>
                        <span>D</span>
                      </div>
                      <div className="sheet-row sheet-head" role="row">
                        <span>#</span>
                        <span>질문</span>
                        <span>답변</span>
                        <span>최근 학습</span>
                        <span>관리</span>
                      </div>
                      {activeWordbook.words.map((word, index) => {
                        const rowId = `saved-${word.id}`;
                        return (
                        <div className="sheet-row saved-sheet-row" role="row" key={word.id}>
                          <span>{index + 1}</span>
                          <span className={sheetCellClass(rowId, "question")} onClick={() => selectSheetCell(rowId, "question")}>{word.key}</span>
                          <span className={sheetCellClass(rowId, "answer")} onClick={() => selectSheetCell(rowId, "answer")}>{word.value}</span>
                          <span className="sheet-cell muted-cell" onClick={() => setSelectedCell(null)}>{word.lastViewedAt ? new Date(word.lastViewedAt).toLocaleString() : "-"}</span>
                          <span className="sheet-action-cell">
                            <button className="icon-button" onClick={() => handleDeleteWord(word.id)} aria-label={`${word.key} 삭제`} title="삭제">
                              <Trash2 size={16} />
                            </button>
                          </span>
                        </div>
                        );
                      })}
                      {draftRows.map((row, index) => {
                        const rowId = `draft-${index}`;
                        return (
                        <div className="sheet-row draft-sheet-row" role="row" key={index}>
                          <span>{activeWordbook.words.length + index + 1}</span>
                          <input
                            className={sheetCellClass(rowId, "question", "sheet-input")}
                            value={row.question}
                            onChange={(event) => updateDraftRow(index, "question", event.target.value)}
                            onFocus={() => selectSheetCell(rowId, "question")}
                            onPaste={(event) => handleDraftPaste(event, index, "question")}
                            placeholder={index === 0 ? "apple" : ""}
                            aria-label={`질문 ${index + 1}`}
                          />
                          <input
                            className={sheetCellClass(rowId, "answer", "sheet-input")}
                            value={row.answer}
                            onChange={(event) => updateDraftRow(index, "answer", event.target.value)}
                            onFocus={() => selectSheetCell(rowId, "answer")}
                            onPaste={(event) => handleDraftPaste(event, index, "answer")}
                            placeholder={index === 0 ? "사과" : ""}
                            aria-label={`답변 ${index + 1}`}
                          />
                          <span className="sheet-cell muted-cell" onClick={() => setSelectedCell(null)}>새 단어</span>
                          <span className="sheet-action-cell">
                            <button className="icon-button" onClick={() => clearDraftRow(index)} aria-label={`입력 ${index + 1} 지우기`} title="입력 지우기" type="button">
                              <Trash2 size={16} />
                            </button>
                          </span>
                        </div>
                        );
                      })}
                      {Array.from({ length: BLANK_SHEET_ROW_COUNT }, (_, index) => (
                        <div className="sheet-row blank-sheet-row" role="row" key={`blank-${index}`} aria-hidden="true">
                          <span>{activeWordbook.words.length + draftRows.length + index + 1}</span>
                          <span />
                          <span />
                          <span />
                          <span />
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {editMode === "export" && (
                <section className="panel file-workspace export-panel" aria-label="파일 내보내기 화면">
                  <div className="panel-heading file-heading">
                    <div>
                      <p className="eyebrow">Markdown Export</p>
                      <h2>파일 내보내기</h2>
                    </div>
                    <div className="button-group">
                      <button className="ghost-button" onClick={openExportMode} type="button">
                        <Download size={16} />
                        현재 내용 다시 불러오기
                      </button>
                      <button className="primary-button" onClick={downloadMarkdownFile} type="button">
                        <Download size={16} />
                        Markdown 다운로드
                      </button>
                      <button className="icon-button" onClick={openSheetMode} type="button" aria-label="편집으로 돌아가기" title="편집으로 돌아가기">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                  <textarea
                    className="markdown-editor"
                    value={markdown}
                    onChange={(event) => setMarkdown(event.target.value)}
                    aria-label="내보내기 Markdown"
                  />
                </section>
              )}

            </div>
            {importModalOpen && (
              <div className="modal-backdrop">
                <section className="modal-panel import-panel import-modal" role="dialog" aria-modal="true" aria-label="파일 가져오기">
                  <div className="panel-heading file-heading">
                    <div>
                      <p className="eyebrow">Markdown Import</p>
                      <h2>파일 가져오기</h2>
                    </div>
                    <button className="icon-button" onClick={closeImportModal} type="button" aria-label="파일 가져오기 닫기" title="파일 가져오기 닫기">
                      <X size={16} />
                    </button>
                  </div>

                  <div className="import-source-tabs" aria-label="가져오기 위치">
                    <button className={importSource === "local" ? "active" : ""} type="button" onClick={() => setImportSource("local")}>
                      로컬 파일
                    </button>
                    <button className={importSource === "google-drive" ? "active" : ""} type="button" onClick={() => setImportSource("google-drive")}>
                      Google Drive
                    </button>
                  </div>

                  <div className="import-controls">
                    {importSource === "local" ? (
                      <label className="file-picker-label">
                        <span>로컬 Markdown 파일</span>
                        <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={handleLocalFileChange} aria-label="로컬 Markdown 파일" />
                      </label>
                    ) : (
                      <div className="drive-picker-box">
                        <button className="ghost-button" type="button" onClick={handleGoogleDrivePick} disabled={googleDriveLoading}>
                          <Upload size={16} />
                          {googleDriveLoading ? "Google Drive 여는 중..." : "Google Drive에서 선택"}
                        </button>
                        {!hasGoogleDriveConfig() && (
                          <p className="status-line">
                            Google Cloud 설정 후 사용할 수 있습니다. 이미 Google에 로그인되어 있으면 계정 선택/권한 확인 뒤 Drive 파일 선택창이 열립니다.
                          </p>
                        )}
                      </div>
                    )}
                    <label className="import-name-field">
                      <span>새 암기장 이름</span>
                      <input
                        value={importWordbookName}
                        onChange={(event) => setImportWordbookName(event.target.value)}
                        placeholder="예: 여행 영어 표현"
                        aria-label="새 암기장 이름"
                      />
                    </label>
                  </div>

                  <textarea
                    className="markdown-editor"
                    value={markdown}
                    onChange={(event) => setMarkdown(event.target.value)}
                    placeholder="| question | answer | lastViewedAt |"
                    aria-label="가져오기 Markdown"
                  />
                  <div className="import-footer">
                    <p className={importValidation.error ? "form-error" : "status-line"}>
                      {importValidation.error || `${importValidation.count}개 단어를 새 암기장으로 만들 수 있습니다.`}
                    </p>
                    <button className="primary-button" onClick={createWordbookFromMarkdown} type="button" disabled={Boolean(importValidation.error)}>
                      새 암기장 만들기
                    </button>
                  </div>
                </section>
              </div>
            )}
          </section>
        )}

        {homeView === "profile" && (
          <section className="profile-home" aria-label="프로필">
            <h1>프로필</h1>
            <div className="profile-stats">
              <div>
                <span>{summary.cumulativeLearningDays}</span>
                <small>누적 학습일</small>
              </div>
              <div>
                <span>{summary.todayStudiedCount}</span>
                <small>오늘 학습한 단어</small>
              </div>
              <div>
                <span>{summary.memorizedWordCount}</span>
                <small>외운 단어</small>
              </div>
            </div>
            <section className="memorized-list" aria-label="외운 단어 목록">
              <h2>외운 단어</h2>
              {summary.memorizedWords.length > 0 ? (
                summary.memorizedWords.map((word) => (
                  <button
                    key={word.wordId}
                    className="memorized-item"
                    type="button"
                    onClick={() => {
                      const memorizedWordbook = wordbooks.find((wordbook) => wordbook.id === word.wordbookId);
                      if (memorizedWordbook) {
                        selectWordbook(memorizedWordbook);
                      } else {
                        setActiveWordbookId(word.wordbookId);
                        resetStudySession();
                      }
                      setHomeView("study");
                    }}
                  >
                    <span>
                      <strong>{word.key}</strong>
                      <small>{word.wordbookName}</small>
                    </span>
                    <em>{word.value}</em>
                  </button>
                ))
              ) : (
                <p className="profile-empty">아직 알고 있음으로 표시한 단어가 없습니다.</p>
              )}
            </section>
            <section className="memorized-list" aria-label="실수 노트">
              <h2>실수 노트</h2>
              {mistakeCards.length > 0 ? (
                mistakeCards.map((card) => (
                  <article key={card.cardId} className="memorized-item">
                    <span>
                      <strong>{card.prompt}</strong>
                      <small>{card.cardType}</small>
                    </span>
                    <em>{card.answer}</em>
                  </article>
                ))
              ) : (
                <p className="profile-empty">최근 다시 보기 카드가 없습니다.</p>
              )}
            </section>
          </section>
        )}
      </section>
    </main>
  );
}
