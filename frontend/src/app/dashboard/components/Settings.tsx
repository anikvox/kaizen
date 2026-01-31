"use client";

import { Bell, Shield, User, Zap, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

export function Settings() {
    const [sustainedTime, setSustainedTime] = useState(2500);
    const [idleThreshold, setIdleThreshold] = useState(15000);
    const [debugMode, setDebugMode] = useState(false);

    return (
        <div className="max-w-4xl mx-auto p-8 space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Settings</h1>
                <p className="text-gray-500 dark:text-gray-400">Configure your attention and tracking preferences</p>
            </div>

            <div className="grid gap-6">
                {/* Cognitive Attention */}
                <section className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600">
                            <Zap size={20} />
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Cognitive Attention</h2>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between mb-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Sustained Time</label>
                                <span className="text-xs font-mono text-gray-500">{sustainedTime}ms</span>
                            </div>
                            <input
                                type="range"
                                min="500"
                                max="5000"
                                step="100"
                                value={sustainedTime}
                                onChange={(e) => setSustainedTime(parseInt(e.target.value))}
                                className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>

                        <div>
                            <div className="flex justify-between mb-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Idle Threshold</label>
                                <span className="text-xs font-mono text-gray-500">{(idleThreshold / 1000).toFixed(0)}s</span>
                            </div>
                            <input
                                type="range"
                                min="5000"
                                max="60000"
                                step="1000"
                                value={idleThreshold}
                                onChange={(e) => setIdleThreshold(parseInt(e.target.value))}
                                className="w-full h-2 bg-gray-200 dark:border-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>

                        <div className="flex items-center justify-between py-4 border-t border-gray-100 dark:border-gray-800">
                            <div>
                                <h3 className="text-sm font-medium text-gray-900 dark:text-white">Debug Mode</h3>
                                <p className="text-xs text-gray-500">Enable verbose logging in terminal</p>
                            </div>
                            <button
                                onClick={() => setDebugMode(!debugMode)}
                                className={`w-12 h-6 rounded-full transition-colors relative ${debugMode ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-800"
                                    }`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${debugMode ? "left-7" : "left-1"
                                    }`} />
                            </button>
                        </div>
                    </div>
                </section>

                {/* Account & Security */}
                <section className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl text-purple-600">
                            <Shield size={20} />
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Account & Sync</h2>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-700">
                            <div className="flex items-center gap-3">
                                <User size={18} className="text-gray-400" />
                                <span className="text-sm text-gray-700 dark:text-gray-300">Profile Settings</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-700">
                            <div className="flex items-center gap-3">
                                <Bell size={18} className="text-gray-400" />
                                <span className="text-sm text-gray-700 dark:text-gray-300">Notification Preferences</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-700">
                            <div className="flex items-center gap-3">
                                <RefreshCw size={18} className="text-gray-400" />
                                <span className="text-sm text-gray-700 dark:text-gray-300">Sync Now</span>
                            </div>
                            <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 px-2 py-0.5 rounded-full font-bold">ACTIVE</span>
                        </div>
                    </div>
                </section>

                {/* Danger Zone */}
                <section className="bg-red-50 dark:bg-red-900/10 rounded-2xl p-6 border border-red-100 dark:border-red-900/30">
                    <div className="flex items-center gap-3 mb-4">
                        <Trash2 size={20} className="text-red-600" />
                        <h2 className="text-lg font-semibold text-red-900 dark:text-red-100">Danger Zone</h2>
                    </div>
                    <p className="text-sm text-red-700 dark:text-red-300/70 mb-4">Deleting your data is permanent and cannot be undone.</p>
                    <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-all shadow-sm">
                        Clear all data
                    </button>
                </section>
            </div>
        </div>
    );
}
