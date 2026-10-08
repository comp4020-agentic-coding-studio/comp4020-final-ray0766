import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
  }
}

// The spec checks a RUNNING app over HTTP, so it holds whatever the app is
// built with. CI builds the Dockerfile, starts the image and points APP_URL
// at it, so what passes there is what deploys. Locally, start your app however
// you run it, then `pnpm check`; APP_URL says where it's listening. It waits
// up to a minute, since some stacks take a while to boot or migrate.
export default async function setup(project: TestProject): Promise<void> {
  const baseUrl = process.env.APP_URL ?? "http://localhost:8080";

  for (let attempt = 0; ; attempt++) {
    try {
      const response=await fetch(baseUrl);
      if(!response.ok)throw new Error(`App returned HTTP ${response.status}`);
      break;
    } catch {
      // not up yet
    }
    if (attempt >= 300) {
      throw new Error(
        `nothing is answering at ${baseUrl}: start your app first, or set APP_URL to where it's listening`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // An explicit handshake prevents a legacy HTTP suite from creating test
  // identities in an integrated or existing preview database by mistake.
  if(process.env.EXPECT_WORLD_PROFILE){
    const response=await fetch(baseUrl+'/healthz'),health=await response.json() as {ok?:boolean;profile?:string};
    if(!response.ok||!health.ok||health.profile!==process.env.EXPECT_WORLD_PROFILE)throw new Error(`Expected ${process.env.EXPECT_WORLD_PROFILE} at ${baseUrl}; received ${health.profile??'unknown'}. No HTTP tests were started.`);
  }
  project.provide("baseUrl", baseUrl);
}
