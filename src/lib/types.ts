export interface Deck {
  id: string;
  title: string;
  original_filename: string;
  page_count: number;
  created_at: string;
  updated_at: string;
}

export interface Slide {
  id: string;
  deck_id: string;
  slide_number: number;
  image_path: string | null;
  thumbnail_path: string | null;
  extracted_text: string;
  width: number;
  height: number;
}

export interface ExamDocument {
  id: string;
  title: string;
  original_filename: string;
  page_count: number;
  created_at: string;
}

export interface ExamPage {
  id: string;
  exam_id: string;
  page_number: number;
  image_path: string | null;
  extracted_text: string;
}

export interface ChatThread {
  id: string;
  deck_id: string | null;
  slide_id: string | null;
  exam_id: string | null;
  context_mode: ContextMode;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  slide_number: number | null;
  region_data: string | null;
  difficulty: DifficultyMode;
  created_at: string;
}

export interface Quiz {
  id: string;
  deck_id: string;
  source_scope: string;
  difficulty: DifficultyMode;
  questions: QuizQuestion[];
  created_at: string;
}

export interface QuizQuestion {
  type: "multiple_choice" | "short_answer" | "concept_check" | "calculation";
  question: string;
  options?: string[];
  answer: string;
  hint?: string;
  explanation?: string;
}

export interface SlideRelevance {
  id: string;
  deck_id: string;
  exam_id: string;
  slide_range: string;
  reason: string;
  score: number;
}

export interface RegionSelection {
  x: number;
  y: number;
  width: number;
  height: number;
  slideWidth: number;
  slideHeight: number;
}

export type ContextMode =
  | "current_slide"
  | "selected_region"
  | "neighboring_slides"
  | "slide_range"
  | "entire_deck"
  | "exams_only"
  | "slides_and_exams"
  | "exam_relevance";

export type DifficultyMode =
  | "beginner"
  | "simple"
  | "normal"
  | "advanced"
  | "exam";

export type ExplanationStyle =
  | "concise"
  | "step_by_step"
  | "intuitive"
  | "rigorous"
  | "example_driven";

export type AppLanguage = "en" | "fi";

export interface QuickAction {
  label: string;
  labelFi: string;
  prompt: string;
  promptFi: string;
  icon?: string;
  category: "explain" | "exam" | "create";
}

export const QUICK_ACTIONS: QuickAction[] = [
  { label: "Explain simply", labelFi: "Selitä yksinkertaisesti", prompt: "Explain this slide in simple, easy-to-understand language.", promptFi: "Selitä tämä kalvo yksinkertaisella, helposti ymmärrettävällä kielellä.", category: "explain" },
  { label: "Step by step", labelFi: "Askel askeleelta", prompt: "Explain the content of this slide step by step.", promptFi: "Selitä tämän kalvon sisältö askel askeleelta.", category: "explain" },
  { label: "Summarize", labelFi: "Tiivistä", prompt: "Give me a concise summary of this slide's key points.", promptFi: "Anna tiivis yhteenveto tämän kalvon pääkohdista.", category: "explain" },
  { label: "Key terms", labelFi: "Keskeiset termit", prompt: "Define and explain the key terms on this slide.", promptFi: "Määrittele ja selitä tämän kalvon keskeiset termit.", category: "explain" },
  { label: "Explain formula", labelFi: "Selitä kaava", prompt: "Explain the formula(s) on this slide. Break down each part and what it means.", promptFi: "Selitä tämän kalvon kaava(t). Erittele jokainen osa ja mitä se tarkoittaa.", category: "explain" },
  { label: "Explain diagram", labelFi: "Selitä kaavio", prompt: "Explain the diagram or figure on this slide. What does it show and why is it important?", promptFi: "Selitä tämän kalvon kaavio tai kuva. Mitä se esittää ja miksi se on tärkeä?", category: "explain" },
  { label: "Give intuition", labelFi: "Anna intuitio", prompt: "Help me build intuition for the concepts on this slide. Use analogies or mental models.", promptFi: "Auta minua ymmärtämään tämän kalvon käsitteet intuitiivisesti. Käytä analogioita tai mielikuvia.", category: "explain" },
  { label: "Give example", labelFi: "Anna esimerkki", prompt: "Give me a concrete example that illustrates the concepts on this slide.", promptFi: "Anna konkreettinen esimerkki, joka havainnollistaa tämän kalvon käsitteitä.", category: "explain" },
  { label: "What to memorize?", labelFi: "Mitä muistaa?", prompt: "What should I memorize from this slide? What are the key facts, formulas, or definitions?", promptFi: "Mitä minun pitäisi muistaa tästä kalvosta? Mitkä ovat tärkeimmät faktat, kaavat tai määritelmät?", category: "exam" },
  { label: "Exam relevant?", labelFi: "Tentissä tärkeää?", prompt: "What on this slide is most likely to appear on an exam? What should I focus on?", promptFi: "Mikä tässä kalvossa tulee todennäköisimmin tenttiin? Mihin minun pitäisi keskittyä?", category: "exam" },
  { label: "3 quiz questions", labelFi: "3 kysymystä", prompt: "Generate 3 quiz questions based on this slide, with answers.", promptFi: "Luo 3 tenttikysymystä tämän kalvon pohjalta, vastauksineen.", category: "create" },
  { label: "Flashcard material", labelFi: "Muistikortteja", prompt: "What are the key flashcard-worthy items from this slide? Give me question-answer pairs.", promptFi: "Mitkä ovat tämän kalvon tärkeimmät muistikortteihin sopivat asiat? Anna kysymys-vastaus-pareja.", category: "create" },
];

export const DIFFICULTY_OPTIONS: { value: DifficultyMode; label: string; labelFi: string; description: string }[] = [
  { value: "beginner", label: "Beginner", labelFi: "Aloittelija", description: "ELI5 explanations" },
  { value: "simple", label: "Simple", labelFi: "Yksinkertainen", description: "Clear and accessible" },
  { value: "normal", label: "Normal", labelFi: "Normaali", description: "Standard detail" },
  { value: "advanced", label: "Advanced", labelFi: "Edistynyt", description: "In-depth technical" },
  { value: "exam", label: "Exam mode", labelFi: "Tenttitila", description: "Focused on testing" },
];

export const CONTEXT_OPTIONS: { value: ContextMode; label: string; labelFi: string; description: string }[] = [
  { value: "current_slide", label: "Current slide", labelFi: "Nykyinen kalvo", description: "Only this slide" },
  { value: "selected_region", label: "Selected region", labelFi: "Valittu alue", description: "Cropped area" },
  { value: "neighboring_slides", label: "± Neighbors", labelFi: "± Naapurit", description: "Current + adjacent" },
  { value: "slide_range", label: "Slide range", labelFi: "Kalvoväli", description: "Custom range" },
  { value: "entire_deck", label: "Entire deck", labelFi: "Koko pakka", description: "All slides" },
  { value: "exams_only", label: "Exams only", labelFi: "Vain tentit", description: "Past exam papers" },
  { value: "slides_and_exams", label: "Slides + exams", labelFi: "Kalvot + tentit", description: "Both combined" },
  { value: "exam_relevance", label: "Exam relevance", labelFi: "Tenttirelevanssi", description: "Priority analysis" },
];

export const CATEGORY_LABELS = {
  en: { explain: "Understand", exam: "Exam prep", create: "Practice" },
  fi: { explain: "Ymmärrä", exam: "Tenttiin", create: "Harjoittele" },
};

export const UI_LABELS = {
  en: {
    studyAssistant: "Study Assistant",
    difficulty: "Difficulty",
    context: "Context",
    style: "Style",
    clearChat: "Clear chat",
    expandChat: "Expand chat",
    collapseChat: "Collapse chat",
    askAboutSlide: "Ask about slide",
    viewingSlide: "Viewing slide",
    askOrQuickAction: "Ask a question or use a quick action.",
    regionSelected: "Region selected — AI will focus on that area",
  },
  fi: {
    studyAssistant: "Opiskeluassistentti",
    difficulty: "Vaikeustaso",
    context: "Konteksti",
    style: "Tyyli",
    clearChat: "Tyhjennä chat",
    expandChat: "Laajenna chat",
    collapseChat: "Pienennä chat",
    askAboutSlide: "Kysy kalvosta",
    viewingSlide: "Katselet kalvoa",
    askOrQuickAction: "Kysy kysymys tai käytä pikatoimintoa.",
    regionSelected: "Alue valittu — AI keskittyy valittuun alueeseen",
  },
};

export const STYLE_OPTIONS: { value: ExplanationStyle; label: string; labelFi: string }[] = [
  { value: "concise", label: "Concise", labelFi: "Tiivis" },
  { value: "step_by_step", label: "Step-by-step", labelFi: "Askelittain" },
  { value: "intuitive", label: "Intuitive", labelFi: "Intuitiivinen" },
  { value: "rigorous", label: "Rigorous", labelFi: "Tarkka" },
  { value: "example_driven", label: "Examples", labelFi: "Esimerkit" },
];
