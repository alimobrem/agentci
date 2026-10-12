'use client';
// Reviewed local shadcn-style wrapper over Radix keyboard/ARIA primitives; no generator executes.
import * as TabsPrimitive from '@radix-ui/react-tabs';
import type {ReactNode} from 'react';
export function ReviewTabs({summary,evidence}:{summary:ReactNode;evidence:ReactNode}){return <TabsPrimitive.Root defaultValue="summary"><TabsPrimitive.List aria-label="Review details" className="flex gap-2 border-b"><TabsPrimitive.Trigger value="summary" className="p-3 focus-visible:outline-2 data-[state=active]:border-b-2">Summary</TabsPrimitive.Trigger><TabsPrimitive.Trigger value="evidence" className="p-3 focus-visible:outline-2 data-[state=active]:border-b-2">Evidence</TabsPrimitive.Trigger></TabsPrimitive.List><TabsPrimitive.Content value="summary" className="pt-4 focus-visible:outline-2">{summary}</TabsPrimitive.Content><TabsPrimitive.Content value="evidence" className="pt-4 focus-visible:outline-2">{evidence}</TabsPrimitive.Content></TabsPrimitive.Root>;}
