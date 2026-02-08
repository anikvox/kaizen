"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useAuth, SignInButton, useUser } from "@clerk/nextjs";
import { createApiClient, type QuizWithAnswers } from "@kaizen/api-client";
import Link from "next/link";

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

type QuizState = "loading" | "idle" | "generating" | "active" | "completed" | "error";

// Seeded random for consistent shuffling per question
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Shuffle array with seed for consistent ordering
function shuffleWithSeed<T>(array: T[], seed: number): { shuffled: T[]; indexMap: number[] } {
  const indices = array.map((_, i) => i);
  const shuffled = [...array];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  return { shuffled, indexMap: indices };
}

export default function QuizPage() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [quizState, setQuizState] = useState<QuizState>("loading");
  const [quiz, setQuiz] = useState<QuizWithAnswers | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const autoAdvanceRef = useRef<NodeJS.Timeout | null>(null);

  const getTokenFn = useCallback(async () => {
    return getToken();
  }, [getToken]);

  // Calculate shuffled options for current question
  const shuffledOptions = useMemo(() => {
    if (!quiz || currentIndex >= quiz.questions.length) return null;
    const question = quiz.questions[currentIndex];
    const seed = currentIndex * 1000 + parseInt(quiz.id.replace(/\D/g, "").slice(0, 6) || "0", 10);
    return shuffleWithSeed(question.options, seed);
  }, [quiz, currentIndex]);

  // Get the answer for current question if exists
  const currentAnswer = useMemo(() => {
    if (!quiz) return null;
    return quiz.answers.find(a => a.questionIndex === currentIndex);
  }, [quiz, currentIndex]);

  // Calculate score
  const score = useMemo(() => {
    if (!quiz) return 0;
    return quiz.answers.filter(a => a.isCorrect).length;
  }, [quiz]);

  // Load current quiz on mount
  useEffect(() => {
    if (!isSignedIn || !clerkUser || !isLoaded) return;

    const loadCurrentQuiz = async () => {
      const api = createApiClient(apiUrl, getTokenFn);

      try {
        const email = clerkUser.emailAddresses[0]?.emailAddress;
        if (email) {
          await api.users.sync({
            email,
            name: clerkUser.fullName || undefined,
          });
        }

        const { quiz: currentQuiz } = await api.quiz.getCurrent();

        if (currentQuiz) {
          setQuiz(currentQuiz);
          if (currentQuiz.completedAt) {
            setQuizState("completed");
          } else {
            const answeredIndices = new Set(currentQuiz.answers.map(a => a.questionIndex));
            const firstUnanswered = currentQuiz.questions.findIndex((_, i) => !answeredIndices.has(i));
            setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
            setQuizState("active");
          }
        } else {
          setQuizState("idle");
        }
      } catch (err) {
        console.error("Failed to load quiz:", err);
        setQuizState("idle");
      }
    };

    loadCurrentQuiz();
  }, [isSignedIn, isLoaded, clerkUser, getTokenFn]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    };
  }, []);

  // Start quiz generation
  const generateQuiz = async () => {
    if (!isSignedIn || !clerkUser) return;

    setQuizState("generating");
    setError(null);
    setQuiz(null);
    setCurrentIndex(0);
    setLastAnswerCorrect(null);

    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const { jobId } = await api.quiz.generate();
      pollJobStatus(jobId);
    } catch (err: unknown) {
      console.error("Failed to start quiz generation:", err);
      setQuizState("error");
      setError("Failed to start quiz generation. Please try again.");
    }
  };

  // Poll job status
  const pollJobStatus = async (jobId: string) => {
    const api = createApiClient(apiUrl, getTokenFn);

    const checkStatus = async () => {
      try {
        const result = await api.quiz.getJobStatus(jobId);

        if (result.status === "completed" && result.quiz) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setQuiz(result.quiz);
          setCurrentIndex(0);
          setQuizState("active");
        } else if (result.status === "failed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setQuizState("error");
          if (result.code === "INSUFFICIENT_DATA") {
            setError("Not enough browsing activity to generate a quiz. Keep browsing and try again later!");
          } else {
            setError(result.error || "Quiz generation failed. Please try again.");
          }
        }
      } catch (err) {
        console.error("Failed to check job status:", err);
        if (pollingRef.current) clearInterval(pollingRef.current);
        setQuizState("error");
        setError("Failed to check quiz status. Please try again.");
      }
    };

    await checkStatus();
    pollingRef.current = setInterval(checkStatus, 1000);
  };

  // Submit answer
  const submitAnswer = async (displayIndex: number) => {
    if (!quiz || !shuffledOptions || submitting || currentAnswer) return;

    const originalIndex = shuffledOptions.indexMap[displayIndex];

    setSubmitting(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const result = await api.quiz.submitAnswer(quiz.id, currentIndex, originalIndex);

      if (result.success) {
        setLastAnswerCorrect(result.isCorrect);
        setQuiz(result.quiz);

        if (result.quiz.completedAt) {
          autoAdvanceRef.current = setTimeout(() => {
            setQuizState("completed");
          }, 3000);
        } else {
          autoAdvanceRef.current = setTimeout(() => {
            setLastAnswerCorrect(null);
            const answeredIndices = new Set(result.quiz.answers.map(a => a.questionIndex));
            const nextIndex = result.quiz.questions.findIndex((_, i) => i > currentIndex && !answeredIndices.has(i));
            if (nextIndex >= 0) {
              setCurrentIndex(nextIndex);
            } else {
              const firstUnanswered = result.quiz.questions.findIndex((_, i) => !answeredIndices.has(i));
              if (firstUnanswered >= 0) {
                setCurrentIndex(firstUnanswered);
              }
            }
          }, 3000);
        }
      }
    } catch (err) {
      console.error("Failed to submit answer:", err);
      setError("Failed to submit answer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isLoaded) {
    return (
      <main style={{ padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
        <p>Loading...</p>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main style={{ padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
        <h1>Daily Quiz</h1>
        <p>Sign in to take your quiz.</p>
        <SignInButton mode="modal" />
      </main>
    );
  }

  const currentQuestion = quiz?.questions[currentIndex];

  return (
    <main style={{ padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1rem" }}>
        <Link href="/">← Home</Link>
      </div>

      {error && (
        <div style={{ padding: "1rem", background: "#fee", color: "#c00", marginBottom: "1rem", borderRadius: "4px" }}>
          {error}
        </div>
      )}

      {quizState === "loading" && <p>Loading quiz...</p>}

      {quizState === "idle" && (
        <div>
          <h1>Daily Quiz</h1>
          <p>Test your knowledge based on your recent browsing.</p>
          <button onClick={generateQuiz} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>
            Generate Quiz
          </button>
        </div>
      )}

      {quizState === "generating" && (
        <div>
          <h1>Daily Quiz</h1>
          <p>Generating your quiz...</p>
        </div>
      )}

      {quizState === "error" && (
        <div>
          <h1>Daily Quiz</h1>
          <button onClick={generateQuiz} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>
            Try Again
          </button>
        </div>
      )}

      {quizState === "active" && quiz && currentQuestion && shuffledOptions && (
        <div>
          <div style={{ marginBottom: "1rem", color: "#666" }}>
            Question {currentIndex + 1} of {quiz.questions.length} ({quiz.answers.length} answered)
          </div>

          <div style={{ padding: "1rem", border: "1px solid #ddd", borderRadius: "4px", marginBottom: "1rem" }}>
            <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>{currentQuestion.question}</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {shuffledOptions.shuffled.map((option, displayIndex) => {
                const originalIndex = shuffledOptions.indexMap[displayIndex];
                const hasAnswered = currentAnswer != null;
                const isSelected = hasAnswered && currentAnswer!.selectedIndex === originalIndex;
                const isCorrect = originalIndex === currentQuestion.correctIndex;
                const showCorrect = hasAnswered && isCorrect;
                const showWrong = hasAnswered && isSelected && !isCorrect;

                let bg = "#f5f5f5";
                if (showCorrect) bg = "#dfd";
                else if (showWrong) bg = "#fdd";

                return (
                  <button
                    key={displayIndex}
                    onClick={() => submitAnswer(displayIndex)}
                    disabled={hasAnswered || submitting}
                    style={{
                      padding: "0.75rem",
                      textAlign: "left",
                      background: bg,
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      cursor: hasAnswered ? "default" : "pointer",
                    }}
                  >
                    {String.fromCharCode(65 + displayIndex)}. {option}
                    {showCorrect && " ✓"}
                    {showWrong && " ✗"}
                  </button>
                );
              })}
            </div>

            {lastAnswerCorrect !== null && (
              <div style={{ marginTop: "1rem", fontWeight: "bold", color: lastAnswerCorrect ? "green" : "red" }}>
                {lastAnswerCorrect ? "Correct!" : "Incorrect"}
              </div>
            )}
          </div>
        </div>
      )}

      {quizState === "completed" && quiz && (
        <div>
          <h1>Quiz Complete</h1>
          <p style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
            Score: {score}/{quiz.questions.length}
          </p>

          <div style={{ margin: "1rem 0", padding: "1rem", background: "#f5f5f5", borderRadius: "4px" }}>
            <h3 style={{ margin: "0 0 0.5rem" }}>Summary</h3>
            {quiz.questions.map((q, idx) => {
              const answer = quiz.answers.find(a => a.questionIndex === idx);
              const isCorrect = answer?.isCorrect ?? false;
              return (
                <div key={q.id} style={{ padding: "0.25rem 0", borderBottom: "1px solid #ddd" }}>
                  {isCorrect ? "✓" : "✗"} {q.question}
                </div>
              );
            })}
          </div>

          <button onClick={generateQuiz} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>
            Take Another Quiz
          </button>
        </div>
      )}
    </main>
  );
}
