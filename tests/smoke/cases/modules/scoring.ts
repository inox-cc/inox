type ModuleProfile = {
  name: string
  score: number
}

export function addScore(profile: ModuleProfile, bonus: number): ModuleProfile {
  return {
    name: profile.name,
    score: profile.score + bonus
  }
}

export function describe(name: string, score: number): string {
  return name + '=' + String(score)
}
