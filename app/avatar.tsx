"use client";
import {useEffect,useState} from "react";
export function initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(word=>Array.from(word)[0]).join("").toUpperCase()||"N";}
export default function Avatar({name,photoVersion,className="profile-avatar"}:{name:string;photoVersion?:string|null;className?:string}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[photoVersion]);
 return <span className={className}>{photoVersion&&!failed?<img src={`/api/profile/photo?v=${encodeURIComponent(photoVersion)}`} alt="" onError={()=>setFailed(true)}/>:initials(name)}</span>;
}
