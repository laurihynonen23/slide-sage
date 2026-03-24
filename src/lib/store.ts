// Simple client-side state management using React context + useReducer
import { createContext, useContext } from "react";
import type { Deck, Slide, ExamDocument, DifficultyMode, ContextMode, ExplanationStyle, RegionSelection, AppLanguage } from "./types";

export interface AppState {
  // Decks & slides
  decks: Deck[];
  activeDeckId: string | null;
  slides: Slide[];
  currentSlideIndex: number;

  // Exams
  exams: ExamDocument[];

  // Chat
  chatMessages: { role: "user" | "assistant"; content: string; slideNumber?: number }[];
  isStreaming: boolean;

  // Controls
  difficulty: DifficultyMode;
  contextMode: ContextMode;
  style: ExplanationStyle | null;
  slideRange: { from: number; to: number } | null;

  // Region selection
  selectedRegion: RegionSelection | null;

  // UI
  isUploading: boolean;
  uploadProgress: string;
  isSidebarOpen: boolean;
  isExamPanelOpen: boolean;
  isQuizModalOpen: boolean;
  examInsights: ExamAnalysis | null;
  chatExpanded: boolean;
  language: AppLanguage;
}

export interface ExamAnalysis {
  summary: string;
  recurring_topics: string[];
  question_styles: string[];
  high_priority_slides: { range: string; reason: string; score: number }[];
  recommendations: string[];
}

export type AppAction =
  | { type: "SET_DECKS"; decks: Deck[] }
  | { type: "SET_ACTIVE_DECK"; deckId: string | null }
  | { type: "SET_SLIDES"; slides: Slide[] }
  | { type: "SET_CURRENT_SLIDE"; index: number }
  | { type: "SET_EXAMS"; exams: ExamDocument[] }
  | { type: "ADD_CHAT_MESSAGE"; message: { role: "user" | "assistant"; content: string; slideNumber?: number } }
  | { type: "UPDATE_LAST_ASSISTANT_MESSAGE"; content: string }
  | { type: "CLEAR_CHAT" }
  | { type: "SET_STREAMING"; isStreaming: boolean }
  | { type: "SET_DIFFICULTY"; difficulty: DifficultyMode }
  | { type: "SET_CONTEXT_MODE"; contextMode: ContextMode }
  | { type: "SET_STYLE"; style: ExplanationStyle | null }
  | { type: "SET_SLIDE_RANGE"; range: { from: number; to: number } | null }
  | { type: "SET_REGION"; region: RegionSelection | null }
  | { type: "SET_UPLOADING"; isUploading: boolean; progress?: string }
  | { type: "SET_SIDEBAR_OPEN"; open: boolean }
  | { type: "SET_EXAM_PANEL_OPEN"; open: boolean }
  | { type: "SET_QUIZ_MODAL_OPEN"; open: boolean }
  | { type: "SET_EXAM_INSIGHTS"; insights: ExamAnalysis | null }
  | { type: "SET_CHAT_EXPANDED"; expanded: boolean }
  | { type: "SET_LANGUAGE"; language: AppLanguage };

export const initialState: AppState = {
  decks: [],
  activeDeckId: null,
  slides: [],
  currentSlideIndex: 0,
  exams: [],
  chatMessages: [],
  isStreaming: false,
  difficulty: "normal",
  contextMode: "current_slide",
  style: null,
  slideRange: null,
  selectedRegion: null,
  isUploading: false,
  uploadProgress: "",
  isSidebarOpen: true,
  isExamPanelOpen: false,
  isQuizModalOpen: false,
  examInsights: null,
  chatExpanded: false,
  language: "en",
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_DECKS":
      return { ...state, decks: action.decks };
    case "SET_ACTIVE_DECK":
      return { ...state, activeDeckId: action.deckId, chatMessages: [], currentSlideIndex: 0, selectedRegion: null, examInsights: null };
    case "SET_SLIDES":
      return { ...state, slides: action.slides };
    case "SET_CURRENT_SLIDE":
      return { ...state, currentSlideIndex: action.index, selectedRegion: null };
    case "SET_EXAMS":
      return { ...state, exams: action.exams };
    case "ADD_CHAT_MESSAGE":
      return { ...state, chatMessages: [...state.chatMessages, action.message] };
    case "UPDATE_LAST_ASSISTANT_MESSAGE": {
      const msgs = [...state.chatMessages];
      const lastIdx = msgs.length - 1;
      if (lastIdx >= 0 && msgs[lastIdx].role === "assistant") {
        msgs[lastIdx] = { ...msgs[lastIdx], content: action.content };
      }
      return { ...state, chatMessages: msgs };
    }
    case "CLEAR_CHAT":
      return { ...state, chatMessages: [] };
    case "SET_STREAMING":
      return { ...state, isStreaming: action.isStreaming };
    case "SET_DIFFICULTY":
      return { ...state, difficulty: action.difficulty };
    case "SET_CONTEXT_MODE":
      return { ...state, contextMode: action.contextMode };
    case "SET_STYLE":
      return { ...state, style: action.style };
    case "SET_SLIDE_RANGE":
      return { ...state, slideRange: action.range };
    case "SET_REGION":
      return { ...state, selectedRegion: action.region, contextMode: action.region ? "selected_region" : state.contextMode === "selected_region" ? "current_slide" : state.contextMode };
    case "SET_UPLOADING":
      return { ...state, isUploading: action.isUploading, uploadProgress: action.progress || "" };
    case "SET_SIDEBAR_OPEN":
      return { ...state, isSidebarOpen: action.open };
    case "SET_EXAM_PANEL_OPEN":
      return { ...state, isExamPanelOpen: action.open };
    case "SET_QUIZ_MODAL_OPEN":
      return { ...state, isQuizModalOpen: action.open };
    case "SET_EXAM_INSIGHTS":
      return { ...state, examInsights: action.insights };
    case "SET_CHAT_EXPANDED":
      return { ...state, chatExpanded: action.expanded };
    case "SET_LANGUAGE":
      return { ...state, language: action.language };
    default:
      return state;
  }
}

export const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}>({ state: initialState, dispatch: () => {} });

export function useApp() {
  return useContext(AppContext);
}
