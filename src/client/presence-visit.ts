/** Finish the old ephemeral heartbeat before changing its authoritative visit. */
export class PresenceVisitGate {
  private pending:Promise<unknown>|null=null;
  private changing=0;

  async heartbeat<T>(read:()=>Promise<T>):Promise<T|null> {
    if(this.changing||this.pending)return null;
    const pending=Promise.resolve().then(read);this.pending=pending;
    try{return await pending;}
    finally{if(this.pending===pending)this.pending=null;}
  }

  async transition<T>(changeAndApply:()=>Promise<T>):Promise<T> {
    this.changing++;
    try{
      // Presence failure must not fail a durable visit change. The caller still
      // handles its own heartbeat error and the server retains its epoch fence.
      await this.pending?.catch(()=>{});
      return await changeAndApply();
    }finally{this.changing--;}
  }
}
