// Types
export type {
  QuizSettings,
  QuizQuestion,
  GeneratedQuiz,
  QuizWithAnswers,
  QuizAnswerData,
  QuizJob,
  QuizJobStatus,
  QuizGenerationContext,
} from "./types.js";

export { DEFAULT_QUIZ_SETTINGS } from "./types.js";

// Service
export {
  startQuizGeneration,
  getQuizJobStatus,
  generateQuiz,
  gatherQuizContext,
  getQueueStatus,
  getCurrentQuiz,
  submitAnswer,
  getJobStatus, // deprecated
  extractQuizSettings,
} from "./service.js";
