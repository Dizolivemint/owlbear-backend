export interface Character {
  name?: string;
  appearance?: string;
  species: string;
  description?: string;
  background?: string;
  size: string;
  challenge_rating: string;
  attributes: {
    STR: number;
    DEX: number;
    CON: number;
    INT: number;
    WIS: number;
    CHA: number;
  };
  skills: [
    {
      skill: string;
      description: string;
    }
  ];
  actions: [
    {
    action: string;
    description: string;
    }
  ];
  reactions: [
    {
      reaction: string;
      description: string;
    }
  ];
  legendary_actions?: [
    {
      legendary_action: string;
      description: string;
    }
  ];
}