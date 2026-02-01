"use client";

import { LogOut, AlertCircle, Chrome } from "lucide-react";
import Link from "next/link";

export default function SignedOutPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center px-4">
            <div className="max-w-md w-full">
                {/* Success Card */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                    {/* Header with checkmark */}
                    <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-white dark:bg-gray-900 rounded-full mb-4 shadow-lg">
                            <LogOut className="w-8 h-8 text-green-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">
                            Successfully Logged Out
                        </h1>
                        <p className="text-green-50 text-sm">
                            You've been signed out from your Kaizen account
                        </p>
                    </div>

                    {/* Extension Reminder */}
                    <div className="p-6">
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6">
                            <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 mt-0.5">
                                    <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-1">
                                        Don't Forget Your Extension!
                                    </h3>
                                    <p className="text-xs text-amber-800 dark:text-amber-200/80 leading-relaxed mb-3">
                                        You're now logged out from the Kaizen website, but your browser extension remains linked to your account. For complete logout, please revoke the extension separately.
                                    </p>
                                    <div className="flex items-start gap-2 bg-white dark:bg-gray-800 rounded-lg p-3 border border-amber-200 dark:border-amber-800/50">
                                        <Chrome className="w-4 h-4 text-gray-600 dark:text-gray-400 mt-0.5 flex-shrink-0" />
                                        <div className="text-xs text-gray-700 dark:text-gray-300">
                                            <span className="font-semibold">To revoke extension access:</span>
                                            <ol className="mt-1 ml-4 list-decimal space-y-1 text-gray-600 dark:text-gray-400">
                                                <li>Open the Kaizen extension sidepanel</li>
                                                <li>Click the <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">Revoke Device</span> button</li>
                                            </ol>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-3">
                            <Link
                                href="/"
                                className="block w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 text-center"
                            >
                                Return to Home
                            </Link>
                            <Link
                                href="/sign-in"
                                className="block w-full py-3 px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl transition-colors text-center"
                            >
                                Sign In Again
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Footer Note */}
                <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-6">
                    Need help? Visit our{" "}
                    <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
                        support page
                    </a>
                </p>
            </div>
        </div>
    );
}
