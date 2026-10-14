'use client';
// Reviewed local shadcn-style wrapper over Radix keyboard/ARIA primitives; no generator executes.
import * as TabsPrimitive from '@radix-ui/react-tabs';
import {useEffect,useRef,useState,type ReactNode} from 'react';
const evidenceHash=/^#evidence-[a-f0-9]{64}$/;
export function ReviewTabs({summary,evidence}:{summary:ReactNode;evidence:ReactNode}){
 const [value,setValue]=useState('summary'),[target,setTarget]=useState<string|null>(null),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const activate=()=>{if(evidenceHash.test(location.hash)){setValue('evidence');setTarget(location.hash.slice(1));}else{setValue('summary');setTarget(null);}};activate();window.addEventListener('hashchange',activate);window.addEventListener('popstate',activate);return()=>{window.removeEventListener('hashchange',activate);window.removeEventListener('popstate',activate);};},[]);
 useEffect(()=>{if(value==='evidence'&&target){const frame=requestAnimationFrame(()=>{const element=document.getElementById(target);if(element&&root.current?.contains(element)){element.focus({preventScroll:true});element.scrollIntoView({block:'start'});}setTarget(null);});return()=>cancelAnimationFrame(frame);}},[value,target]);
 return <TabsPrimitive.Root className="review-tabs" ref={root} value={value} onValueChange={setValue} onClickCapture={event=>{const link=(event.target as Element).closest('a');const hash=link?.getAttribute('href');if(!hash||!evidenceHash.test(hash)||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();history.pushState(history.state,'',hash);setValue('evidence');setTarget(hash.slice(1));}}><TabsPrimitive.List aria-label="Review details" className="review-tablist"><TabsPrimitive.Trigger value="summary" className="review-tab">Summary</TabsPrimitive.Trigger><TabsPrimitive.Trigger value="evidence" className="review-tab">Evidence</TabsPrimitive.Trigger></TabsPrimitive.List><TabsPrimitive.Content value="summary" className="review-tabpanel">{summary}</TabsPrimitive.Content><TabsPrimitive.Content value="evidence" className="review-tabpanel">{evidence}</TabsPrimitive.Content></TabsPrimitive.Root>;
}
