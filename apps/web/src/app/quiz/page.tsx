"use client";

import { useState, useCallback, useRef } from "react";
import { useAuth, SignInButton, useUser } from "@clerk/nextjs";
import { createApiClient, type GeneratedQuiz, type QuizQuestion } from "@kaizen/api-client";
import Link from "next/link";

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

type QuizState = "idle" | "generating" | "active" | "completed" | "error";

interface QuizProgress {
  answers: Map<number, number>; // questionIndex -> selectedAnswer
  currentIndex: number;
}

export default function QuizPage() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [quizState, setQuizState] = useState<QuizState>("idle");
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);
  const [progress, setProgress] = useState<QuizProgress>({ answers: new Map(), currentIndex: 0 });
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const getTokenFn = useCallback(async () => {
    return getToken();
  }, [getToken]);

  // Start quiz generation
  const generateQuiz = async () => {
    if (!isSignedIn || !clerkUser) return;

    setQuizState("generating");
    setError(null);
    setQuiz(null);
    setProgress({ answers: new Map(), currentIndex: 0 });

    const api = createApiClient(apiUrl, getTokenFn);

    try {
      // Sync user first
      const email = clerkUser.emailAddresses[0]?.emailAddress;
      if (email) {
        await api.users.sync({
          email,
          name: clerkUser.fullName || undefined,
        });
      }

      // Start generation
      const { jobId } = await api.quiz.generate();

      // Poll for completion
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
        // If pending/processing, keep polling
      } catch (err) {
        console.error("Failed to check job status:", err);
        if (pollingRef.current) clearInterval(pollingRef.current);
        setQuizState("error");
        setError("Failed to check quiz status. Please try again.");
      }
    };

    // Initial check
    await checkStatus();

    // Poll every 1 second
    pollingRef.current = setInterval(checkStatus, 1000);
  };

  // Answer a question
  const selectAnswer = (questionIndex: number, answerIndex: number) => {
    setProgress((prev) => {
      const newAnswers = new Map(prev.answers);
      newAnswers.set(questionIndex, answerIndex);
      return { ...prev, answers: newAnswers };
    });
  };

  // Navigate questions
  const goToQuestion = (index: number) => {
    if (quiz && index >= 0 && index < quiz.questions.length) {
      setProgress((prev) => ({ ...prev, currentIndex: index }));
    }
  };

  // Finish quiz and save result
  const finishQuiz = async () => {
    if (!quiz) return;

    const score = calculateScore();
    setQuizState("completed");

    // Save result to backend
    try {
      const api = createApiClient(apiUrl, getTokenFn);
      await api.quiz.saveResult(quiz.questions.length, score);
    } catch (err) {
      console.error("Failed to save quiz result:", err);
      // Don't show error to user - quiz is still completed locally
    }
  };

  // Calculate score
  const calculateScore = (): number => {
    if (!quiz) return 0;
    let correct = 0;
    quiz.questions.forEach((q, idx) => {
      if (progress.answers.get(idx) === q.correctIndex) {
        correct++;
      }
    });
    return correct;
  };

  // Loading state for auth
  if (!isLoaded) {
    return (
      <main style={{ padding: "2rem", textAlign: "center" }}>
        <p>Loading...</p>
      </main>
    );
  }

  // Not signed in
  if (!isSignedIn) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Daily Learning Quiz</h1>
        <p>Sign in to take your personalized learning quiz.</p>
        <div style={{ marginTop: "1rem" }}>
          <SignInButton mode="modal" />
        </div>
      </main>
    );
  }

  const currentQuestion = quiz?.questions[progress.currentIndex];
  const answeredCount = progress.answers.size;
  const allAnswered = quiz && answeredCount === quiz.questions.length;

  return (
    <main style={{ padding: "2rem", maxWidth: "700px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={{ margin: 0 }}>Daily Learning Quiz</h1>
        <Link href="/" style={{ color: "#666" }}>
          Back to Home
        </Link>
      </div>

      {error && (
        <div
          style={{
            padding: "1rem",
            background: "#ffebee",
            color: "#c62828",
            borderRadius: "8px",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Idle State - Generate button */}
      {quizState === "idle" && (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            border: "1px solid #ddd",
            borderRadius: "8px",
          }}
        >
          <h2 style={{ marginBottom: "1rem" }}>Ready to test your knowledge?</h2>
          <p style={{ color: "#666", marginBottom: "1.5rem" }}>
            Generate a quiz based on your recent browsing activity.
          </p>
          <button
            onClick={generateQuiz}
            style={{
              padding: "0.75rem 2rem",
              background: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "1rem",
              fontWeight: "500",
            }}
          >
            Generate Quiz
          </button>
        </div>
      )}

      {/* Generating State */}
      {quizState === "generating" && (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "4px solid #e0e0e0",
              borderTopColor: "#007bff",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 1rem",
            }}
          />
          <p style={{ color: "#666" }}>Generating your quiz...</p>
          <p style={{ color: "#999", fontSize: "0.9rem" }}>
            This may take a few seconds
          </p>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/* Error State */}
      {quizState === "error" && (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            border: "1px solid #ddd",
            borderRadius: "8px",
          }}
        >
          <h2 style={{ marginBottom: "1rem" }}>Something went wrong</h2>
          <button
            onClick={generateQuiz}
            style={{
              padding: "0.75rem 1.5rem",
              background: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Active Quiz State */}
      {quizState === "active" && quiz && currentQuestion && (
        <div>
          {/* Progress */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1.5rem",
            }}
          >
            <span style={{ color: "#666" }}>
              Question {progress.currentIndex + 1} of {quiz.questions.length}
            </span>
            <span style={{ color: "#666" }}>
              {answeredCount} answered
            </span>
          </div>

          {/* Progress Bar */}
          <div
            style={{
              height: "8px",
              background: "#e0e0e0",
              borderRadius: "4px",
              marginBottom: "2rem",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(answeredCount / quiz.questions.length) * 100}%`,
                background: "#28a745",
                transition: "width 0.3s ease",
              }}
            />
          </div>

          {/* Question */}
          <div
            style={{
              padding: "2rem",
              border: "1px solid #ddd",
              borderRadius: "8px",
              marginBottom: "1.5rem",
            }}
          >
            <h2
              style={{
                fontSize: "1.25rem",
                marginBottom: "1.5rem",
                fontWeight: "500",
              }}
            >
              {currentQuestion.question}
            </h2>

            {/* Options */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
            >
              {(() => {
                const userAnswer = progress.answers.get(progress.currentIndex);
                const hasAnswered = userAnswer !== undefined;
                const correctIndex = currentQuestion.correctIndex;

                return currentQuestion.options.map((option, index) => {
                  const isSelected = userAnswer === index;
                  const isCorrect = index === correctIndex;
                  const isWrong = hasAnswered && isSelected && !isCorrect;

                  let background = "#f8f9fa";
                  let borderColor = "#ddd";
                  let badgeBackground = "#e0e0e0";
                  let badgeColor = "#333";

                  if (hasAnswered) {
                    if (isCorrect) {
                      background = "#e8f5e9";
                      borderColor = "#28a745";
                      badgeBackground = "#28a745";
                      badgeColor = "white";
                    } else if (isWrong) {
                      background = "#ffebee";
                      borderColor = "#dc3545";
                      badgeBackground = "#dc3545";
                      badgeColor = "white";
                    }
                  } else if (isSelected) {
                    background = "#e3f2fd";
                    borderColor = "#007bff";
                    badgeBackground = "#007bff";
                    badgeColor = "white";
                  }

                  return (
                    <button
                      key={index}
                      onClick={() => !hasAnswered && selectAnswer(progress.currentIndex, index)}
                      disabled={hasAnswered}
                      style={{
                        padding: "1rem",
                        background,
                        border: `2px solid ${borderColor}`,
                        borderRadius: "8px",
                        textAlign: "left",
                        cursor: hasAnswered ? "default" : "pointer",
                        fontSize: "1rem",
                        transition: "all 0.2s ease",
                        opacity: hasAnswered && !isCorrect && !isWrong ? 0.6 : 1,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: "24px",
                          height: "24px",
                          lineHeight: "24px",
                          textAlign: "center",
                          background: badgeBackground,
                          color: badgeColor,
                          borderRadius: "50%",
                          marginRight: "0.75rem",
                          fontSize: "0.85rem",
                          fontWeight: "bold",
                        }}
                      >
                        {hasAnswered && isCorrect ? "✓" : hasAnswered && isWrong ? "✗" : String.fromCharCode(65 + index)}
                      </span>
                      {option}
                    </button>
                  );
                });
              })()}
            </div>

            {/* Feedback after answering */}
            {progress.answers.has(progress.currentIndex) && (
              <div
                style={{
                  marginTop: "1.5rem",
                  padding: "1rem",
                  background: progress.answers.get(progress.currentIndex) === currentQuestion.correctIndex ? "#e8f5e9" : "#ffebee",
                  borderRadius: "8px",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontWeight: "bold",
                    color: progress.answers.get(progress.currentIndex) === currentQuestion.correctIndex ? "#28a745" : "#dc3545",
                  }}
                >
                  {progress.answers.get(progress.currentIndex) === currentQuestion.correctIndex ? "Correct!" : "Incorrect"}
                </p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <button
              onClick={() => goToQuestion(progress.currentIndex - 1)}
              disabled={progress.currentIndex === 0}
              style={{
                padding: "0.75rem 1.5rem",
                background: progress.currentIndex === 0 ? "#e0e0e0" : "#6c757d",
                color: progress.currentIndex === 0 ? "#999" : "white",
                border: "none",
                borderRadius: "4px",
                cursor: progress.currentIndex === 0 ? "not-allowed" : "pointer",
                fontSize: "1rem",
              }}
            >
              Previous
            </button>

            {progress.currentIndex < quiz.questions.length - 1 ? (
              <button
                onClick={() => goToQuestion(progress.currentIndex + 1)}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: "#007bff",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "1rem",
                }}
              >
                Next
              </button>
            ) : allAnswered ? (
              <button
                onClick={finishQuiz}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: "#28a745",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "1rem",
                }}
              >
                Finish Quiz
              </button>
            ) : (
              <span style={{ color: "#666", alignSelf: "center" }}>
                Answer all questions to finish
              </span>
            )}
          </div>
        </div>
      )}

      {/* Completed State */}
      {quizState === "completed" && quiz && (
        <div
          style={{
            textAlign: "center",
            padding: "2rem",
            border: "1px solid #ddd",
            borderRadius: "8px",
          }}
        >
          <h2 style={{ marginBottom: "0.5rem" }}>Quiz Completed!</h2>
          <p
            style={{
              fontSize: "3rem",
              fontWeight: "bold",
              color: "#007bff",
              margin: "1rem 0",
            }}
          >
            {calculateScore()}/{quiz.questions.length}
          </p>
          <p style={{ color: "#666", marginBottom: "2rem" }}>
            {calculateScore() === quiz.questions.length
              ? "Perfect score! Amazing!"
              : calculateScore() >= quiz.questions.length * 0.8
              ? "Great job!"
              : calculateScore() >= quiz.questions.length * 0.6
              ? "Good effort!"
              : "Keep learning!"}
          </p>

          {/* Summary */}
          <div
            style={{
              textAlign: "left",
              marginBottom: "2rem",
              padding: "1rem",
              background: "#f8f9fa",
              borderRadius: "8px",
            }}
          >
            <h3 style={{ marginBottom: "1rem", fontSize: "1rem" }}>Summary</h3>
            {quiz.questions.map((q, idx) => {
              const userAnswer = progress.answers.get(idx);
              const isCorrect = userAnswer === q.correctIndex;
              return (
                <div
                  key={q.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 0",
                    borderBottom:
                      idx < quiz.questions.length - 1 ? "1px solid #e0e0e0" : "none",
                  }}
                >
                  <span
                    style={{
                      width: "20px",
                      height: "20px",
                      lineHeight: "20px",
                      textAlign: "center",
                      background: isCorrect ? "#28a745" : "#dc3545",
                      color: "white",
                      borderRadius: "50%",
                      fontSize: "0.75rem",
                      flexShrink: 0,
                    }}
                  >
                    {isCorrect ? "✓" : "✗"}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: "0.9rem",
                      color: "#333",
                    }}
                  >
                    {q.question}
                  </span>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => {
              setQuizState("idle");
              setQuiz(null);
              setProgress({ answers: new Map(), currentIndex: 0 });
              setError(null);
            }}
            style={{
              padding: "0.75rem 2rem",
              background: "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            Generate New Quiz
          </button>
        </div>
      )}
    </main>
  );
}
