"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useAuth, SignInButton, useUser } from "@clerk/nextjs";
import { createApiClient, type QuizWithAnswers } from "@kaizen/api-client";
import Link from "next/link";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Logo,
  Badge,
} from "@kaizen/ui";
import { ArrowLeft, Loader2, HelpCircle, Check, X, RotateCcw, Trophy } from "lucide-react";

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
      <main className="min-h-screen bg-background p-8 max-w-xl mx-auto">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="min-h-screen bg-background p-8 max-w-xl mx-auto">
        <Logo size="md" className="mb-6" />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-pulse" />
              Daily Quiz
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">Sign in to take your quiz.</p>
            <SignInButton mode="modal">
              <Button>Sign In</Button>
            </SignInButton>
          </CardContent>
        </Card>
      </main>
    );
  }

  const currentQuestion = quiz?.questions[currentIndex];

  return (
    <main className="min-h-screen bg-background p-8 max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Logo size="md" />
        </div>
        <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Home
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 text-destructive flex items-center gap-2">
          <X className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {quizState === "loading" && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading quiz...</span>
        </div>
      )}

      {quizState === "idle" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-pulse" />
              Daily Quiz
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-6">
              Test your knowledge based on your recent browsing activity.
            </p>
            <Button onClick={generateQuiz} className="gap-2">
              <HelpCircle className="w-4 h-4" />
              Generate Quiz
            </Button>
          </CardContent>
        </Card>
      )}

      {quizState === "generating" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-pulse" />
              Daily Quiz
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center py-8">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-secondary" />
            <p className="text-muted-foreground">Generating your quiz...</p>
          </CardContent>
        </Card>
      )}

      {quizState === "error" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-pulse" />
              Daily Quiz
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center py-8">
            <Button onClick={generateQuiz} variant="outline" className="gap-2">
              <RotateCcw className="w-4 h-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {quizState === "active" && quiz && currentQuestion && shuffledOptions && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant="secondary">
              Question {currentIndex + 1} of {quiz.questions.length}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {quiz.answers.length} answered
            </span>
          </div>

          <Card>
            <CardContent className="pt-6">
              <h2 className="text-lg font-medium mb-6">{currentQuestion.question}</h2>

              <div className="space-y-3">
                {shuffledOptions.shuffled.map((option, displayIndex) => {
                  const originalIndex = shuffledOptions.indexMap[displayIndex];
                  const hasAnswered = currentAnswer != null;
                  const isSelected = hasAnswered && currentAnswer!.selectedIndex === originalIndex;
                  const isCorrect = originalIndex === currentQuestion.correctIndex;
                  const showCorrect = hasAnswered && isCorrect;
                  const showWrong = hasAnswered && isSelected && !isCorrect;

                  return (
                    <button
                      key={displayIndex}
                      onClick={() => submitAnswer(displayIndex)}
                      disabled={hasAnswered || submitting}
                      className={`w-full p-4 text-left rounded-lg border transition-colors ${
                        showCorrect
                          ? "bg-accent/20 border-accent text-accent-foreground"
                          : showWrong
                            ? "bg-destructive/20 border-destructive text-destructive-foreground"
                            : hasAnswered
                              ? "bg-muted border-border cursor-default"
                              : "bg-muted/50 border-border hover:bg-muted hover:border-primary cursor-pointer"
                      } ${submitting ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span>
                          <span className="font-medium mr-2">{String.fromCharCode(65 + displayIndex)}.</span>
                          {option}
                        </span>
                        {showCorrect && <Check className="w-5 h-5 text-accent" />}
                        {showWrong && <X className="w-5 h-5 text-destructive" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {lastAnswerCorrect !== null && (
                <div className={`mt-6 p-4 rounded-lg text-center font-semibold ${
                  lastAnswerCorrect
                    ? "bg-accent/20 text-accent"
                    : "bg-destructive/20 text-destructive"
                }`}>
                  {lastAnswerCorrect ? "Correct!" : "Incorrect"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {quizState === "completed" && quiz && (
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-8 h-8 text-accent" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Quiz Complete!</h2>
              <p className="text-3xl font-bold text-secondary mb-4">
                {score}/{quiz.questions.length}
              </p>
              <p className="text-muted-foreground">
                {score === quiz.questions.length
                  ? "Perfect score! You're a knowledge master."
                  : score >= quiz.questions.length / 2
                    ? "Great job! Keep up the learning."
                    : "Keep practicing, you'll improve!"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {quiz.questions.map((q, idx) => {
                  const answer = quiz.answers.find(a => a.questionIndex === idx);
                  const isCorrect = answer?.isCorrect ?? false;
                  return (
                    <div key={q.id} className="flex items-start gap-2 py-2 border-b border-border last:border-0">
                      {isCorrect ? (
                        <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                      ) : (
                        <X className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                      )}
                      <span className="text-sm">{q.question}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Button onClick={generateQuiz} className="w-full gap-2">
            <RotateCcw className="w-4 h-4" />
            Take Another Quiz
          </Button>
        </div>
      )}
    </main>
  );
}
