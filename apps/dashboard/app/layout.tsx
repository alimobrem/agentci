import type {ReactNode} from 'react';
import './globals.css';
export const metadata={title:'AgentCI review dashboard',description:'Scoped review and retained evidence'};
export default function Layout({children}:{children:ReactNode}){return <html lang="en"><body><a href="#main" className="sr-only focus:not-sr-only">Skip to review content</a><header className="border-b bg-white px-6 py-4"><span className="text-xl font-semibold">AgentCI</span><span className="ml-4 text-sm">Review dashboard · M3 local development</span></header><main id="main" className="mx-auto max-w-5xl p-6">{children}</main></body></html>;}
