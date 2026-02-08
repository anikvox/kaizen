/**
 * Quiz types - Quiz generation with persistent storage
 */

export interface QuizSettings {
  answerOptionsCount: number; // 2, 3, or 4
  activityDays: number; // 1-7
}

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  answerOptionsCount: 2,
  activityDays: 3,
};

export interface QuizQuestion {
  id: string;
  questionIndex: number;
  question: string;
  options: string[];
  correctIndex: number;
}

export interface GeneratedQuiz {
  id: string;
  questions: QuizQuestion[];
  generatedAt: string;
  activityDays: number;
  optionsCount: number;
}

export interface QuizWithAnswers extends GeneratedQuiz {
  answers: QuizAnswerData[];
  completedAt: string | null;
  score: number | null;
}

export interface QuizAnswerData {
  questionIndex: number;
  selectedIndex: number;
  isCorrect: boolean;
  answeredAt: string;
}

export type QuizJobStatus = "pending" | "processing" | "completed" | "failed";

export interface QuizJob {
  id: string;
  userId: string;
  status: QuizJobStatus;
  createdAt: string;
  result?: GeneratedQuiz;
  error?: string;
}

export interface QuizGenerationContext {
  focusTopics: string[];
  websiteCount: number;
  totalWordsRead: number;
  serializedAttention: string;
  previousQuestions: string[]; // For deduplication
}
