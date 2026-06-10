import Link from 'next/link';
import { Camera, Map as MapIcon } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="w-full min-h-screen p-6 sm:p-8 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-200">
      <div className="max-w-5xl mx-auto space-y-10">

        {/* กลุ่มที่ 1: Basic Config */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase text-zinc-500 dark:text-zinc-400">
            <span className="w-3.5 h-3.5 border-2 border-blue-500 rounded-sm inline-block"></span>
            Basic Config
          </div>
          <hr className="border-zinc-200 dark:border-zinc-800" />

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-6 pt-2">
            <Link
              href="/settings/camera"
              className="flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 group text-center"
            >
              <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full flex items-center justify-center shadow-md group-hover:scale-105 group-hover:border-blue-500 transition-all duration-200">
                <Camera className="w-8 h-8 text-blue-500 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
              </div>
              <span className="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">
                Camera
              </span>
            </Link>
          </div>
        </section>

        {/* กลุ่มที่ 2: App Config */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase text-zinc-500 dark:text-zinc-400">
            <span className="w-3.5 h-3.5 border-2 border-emerald-500 rounded-sm inline-block"></span>
            App Config
          </div>
          <hr className="border-zinc-200 dark:border-zinc-800" />

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-6 pt-2">
            <Link
              href="/settings/map"
              className="flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 group text-center"
            >
              <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full flex items-center justify-center shadow-md group-hover:scale-105 group-hover:border-emerald-500 transition-all duration-200">
                <MapIcon className="w-8 h-8 text-emerald-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
              </div>
              <span className="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">
                Map
              </span>
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}