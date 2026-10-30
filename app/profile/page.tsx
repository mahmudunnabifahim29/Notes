"use client";
import {useEffect,useState} from "react";
import {useAuthStatus} from "../auth-provider";
import ProfileDialog from "../profile-dialog";
import {api} from "../ui";
type Session={user:{name:string;email:string}|null;isAdmin:boolean};
export default function ProfilePage(){
 const status=useAuthStatus();const [session,setSession]=useState<Session|null>(null),[error,setError]=useState("");
 const refresh=async()=>{setSession(await api("session"));};
 useEffect(()=>{let active=true;setSession(null);if(status.ready)api("session").then(s=>{if(active)setSession(s);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[status.ready,status.revision]);
 if(error)return <main className="auth-shell"><p role="alert">{error}</p><a href="/">Back to workspace</a></main>;
 if(!session)return <main className="auth-shell"><p role="status">Loading your profile…</p></main>;
 if(!session.user)return <main className="auth-shell"><h1>Your profile</h1><a className="button primary" href="/login">Sign in to manage your profile</a><a href="/">Back to workspace</a></main>;
 return <ProfileDialog page name={session.user.name} email={session.user.email} isAdmin={session.isAdmin} onClose={()=>window.location.assign('/')} onSaved={refresh}/>;
}
