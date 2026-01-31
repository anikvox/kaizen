"use client";

/**
 * CompactQuizCard - Professional quiz interface
 */

import { AnimatePresence, motion } from "framer-motion"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Brain, CheckCircle2, XCircle } from "lucide-react"

import type { QuizQuestionWithId } from "../types"

type QuizQuestion = QuizQuestionWithId

// Shuffle options for a question to randomize order
function shuffleOptions(
    question: QuizQuestion
): { option: string; isCorrect: boolean; originalIndex: 1 | 2 }[] {
    const options = [
        {
            option: question.option_1,
            isCorrect: question.correct_answer === 1,
            originalIndex: 1 as 1 | 2
        },
        {
            option: question.option_2,
            isCorrect: question.correct_answer === 2,
            originalIndex: 2 as 1 | 2
        }
    ]

    // Fisher-Yates shuffle
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
            ;[options[i], options[j]] = [options[j], options[i]]
    }

    return options
}

interface CompactQuizCardProps {
    questions: QuizQuestion[]
    unansweredQuestions: QuizQuestion[]
    isLoading?: boolean
    onAnswerSubmit: (questionId: number) => void
}

export function CompactQuizCard({
    questions,
    unansweredQuestions,
    isLoading = false,
    onAnswerSubmit
}: CompactQuizCardProps) {
    const [currentIndex, setCurrentIndex] = useState(0)
    const [feedback, setFeedback] = useState<{
        show: boolean
        isCorrect: boolean
    } | null>(null)
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
    const [sessionScore, setSessionScore] = useState(0)
    const [sessionQuestionsAnswered, setSessionQuestionsAnswered] = useState(0)
    const previousUnansweredCount = useRef(unansweredQuestions.length)
    const initialAnsweredCount = useRef(
        questions.length - unansweredQuestions.length
    )

    const currentQuestion = unansweredQuestions[currentIndex]
    const answeredCount = questions.length - unansweredQuestions.length

    // Detect if user just completed questions in this session
    const justCompletedSession =
        sessionQuestionsAnswered > 0 && unansweredQuestions.length === 0

    // Reset session score when new questions become available
    useEffect(() => {
        if (unansweredQuestions.length > previousUnansweredCount.current) {
            // New questions added, reset session
            setSessionScore(0)
            setSessionQuestionsAnswered(0)
            initialAnsweredCount.current = answeredCount
        }
        previousUnansweredCount.current = unansweredQuestions.length
    }, [unansweredQuestions.length, answeredCount])

    // Shuffle options for current question (memoized to prevent re-shuffling on re-renders)
    const shuffledOptions = useMemo(
        () => (currentQuestion ? shuffleOptions(currentQuestion) : []),
        [currentQuestion]
    )

    const handleAnswer = useCallback(
        (optionIndex: number) => {
            if (feedback || !currentQuestion) return

            setSelectedAnswer(optionIndex)
            const selectedOption = shuffledOptions[optionIndex]
            const isCorrect = selectedOption.isCorrect
            setFeedback({ show: true, isCorrect })

            // Update session score and count
            if (isCorrect) {
                setSessionScore((prev) => prev + 1)
            }
            setSessionQuestionsAnswered((prev) => prev + 1)

            setTimeout(() => {
                onAnswerSubmit(currentQuestion.id)
                setFeedback(null)
                setSelectedAnswer(null)
                if (currentIndex >= unansweredQuestions.length - 1) {
                    setCurrentIndex(0)
                }
            }, 1500)
        },
        [
            currentQuestion,
            feedback,
            onAnswerSubmit,
            currentIndex,
            unansweredQuestions.length,
            shuffledOptions
        ]
    )

    if (isLoading) {
        return (
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800">
                <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
                    <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm transition-all duration-300 hover:shadow-md">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-700/30">
                        <Brain className="w-5 h-5 text-indigo-700 dark:text-violet-300" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Knowledge Check
                    </h3>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        {answeredCount}/{questions.length}
                    </span>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}%` }}
                        transition={{ duration: 0.3 }}
                        className="h-full bg-blue-600 dark:bg-blue-500 rounded-full"
                    />
                </div>
                {unansweredQuestions.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        {unansweredQuestions.length} question{unansweredQuestions.length !== 1 ? 's' : ''} remaining
                    </p>
                )}
            </div>

            <AnimatePresence mode="wait">
                {unansweredQuestions.length === 0 ? (
                    <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-center py-12">
                        {justCompletedSession ? (
                            <>
                                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                    <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
                                </div>
                                <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
                                    Quiz Complete!
                                </h4>
                                <div className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 dark:bg-gray-800 rounded-lg mb-4">
                                    <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                                        {sessionScore}
                                    </span>
                                    <span className="text-gray-500 dark:text-gray-400">/</span>
                                    <span className="text-xl text-gray-600 dark:text-gray-400">
                                        {sessionQuestionsAnswered}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {sessionScore === sessionQuestionsAnswered
                                        ? "Perfect score! Excellent work!"
                                        : sessionScore >= sessionQuestionsAnswered * 0.8
                                            ? "Great job! Well done!"
                                            : sessionScore >= sessionQuestionsAnswered * 0.6
                                                ? "Good effort! Keep it up!"
                                                : "Keep practicing!"}
                                </p>
                            </>
                        ) : (
                            <>
                                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                    <CheckCircle2 className="w-10 h-10 text-gray-400" />
                                </div>
                                <h4 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                                    All Caught Up!
                                </h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    You've completed all available questions
                                </p>
                            </>
                        )}
                    </motion.div>
                ) : (
                    <motion.div
                        key={currentQuestion.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-5"
                    >
                        {/* Question */}
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-5">
                            <p className="text-base font-medium text-gray-900 dark:text-gray-100 leading-relaxed">
                                {currentQuestion.question}
                            </p>
                        </div>

                        {/* Answer Options */}
                        <div className="space-y-3">
                            {shuffledOptions.map((optionData, index) => {
                                const isSelected = selectedAnswer === index
                                const isCorrect = optionData.isCorrect
                                const showFeedback = feedback?.show || false

                                let buttonClass = "w-full text-left p-4 rounded-lg border-2 transition-all "

                                if (showFeedback) {
                                    if (isSelected && isCorrect) {
                                        buttonClass += "border-green-500 bg-green-50 dark:bg-green-900/20"
                                    } else if (isSelected && !isCorrect) {
                                        buttonClass += "border-red-500 bg-red-50 dark:bg-red-900/20"
                                    } else if (isCorrect) {
                                        buttonClass += "border-green-500 bg-green-50 dark:bg-green-900/20"
                                    } else {
                                        buttonClass += "border-gray-200 dark:border-gray-700 opacity-50"
                                    }
                                } else {
                                    buttonClass += "border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                                }

                                return (
                                    <button
                                        key={index}
                                        onClick={() => handleAnswer(index)}
                                        disabled={feedback !== null}
                                        className={buttonClass}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${showFeedback && isCorrect
                                                    ? "bg-green-600 text-white"
                                                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                                }`}>
                                                {showFeedback && isCorrect ? "✓" : index + 1}
                                            </div>
                                            <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                                                {optionData.option}
                                            </span>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>

                        {/* Feedback */}
                        {feedback?.show && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className={`flex items-center gap-2 p-3 rounded-lg ${feedback.isCorrect
                                        ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                                        : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                                    }`}
                            >
                                {feedback.isCorrect ? (
                                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                                ) : (
                                    <XCircle className="w-5 h-5 shrink-0" />
                                )}
                                <span className="text-sm font-medium">
                                    {feedback.isCorrect ? "Correct!" : "Incorrect"}
                                </span>
                            </motion.div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
