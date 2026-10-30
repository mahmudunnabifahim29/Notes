"use client";
import {useState} from "react";
import {X,Plus} from "lucide-react";
import {normalizeTags} from "@/lib/note-organization";
export default function NoteTags({tags,disabled,onChange}:{tags:string[];disabled:boolean;onChange:(tags:string[])=>void}){
 const [input,setInput]=useState(""),[error,setError]=useState("");
 const add=()=>{try{const next=normalizeTags([...tags,...input.split(",")]);onChange(next);setInput("");setError("");}catch(e){setError((e as Error).message);}};
 return <div className="note-tags-editor"><label htmlFor="note-tags">Tags <small>Up to 10 · private</small></label><div className="tag-chips">{tags.map(tag=><span key={tag}>#{tag}<button disabled={disabled} aria-label={`Remove tag ${tag}`} onClick={()=>onChange(tags.filter(t=>t!==tag))}><X size={12}/></button></span>)}</div><div className="tag-entry"><input id="note-tags" value={input} maxLength={250} disabled={disabled} onBlur={()=>{if(input.trim())add();}} placeholder="Add tags, separated by commas" onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();add();}}}/><button className="button secondary" disabled={disabled||!input.trim()} onClick={add}><Plus size={14}/>Add</button></div>{error&&<p className="form-error" role="alert">{error}</p>}</div>;
}
