import type { EntityDefinition } from "./types"

// Define objects and enemies with their images
const OBJECTS: EntityDefinition[] = [
  { id: "bgCloud", name: "Cloud", imageSrc: "/objects/bgCloud.png", width: 48, height: 16 },
  { id: "bgGreyCloud", name: "Grey Cloud", imageSrc: "/objects/bgGreyCloud.png", width: 48, height: 16 },
  { id: "bgPyramid", name: "Pyramid", imageSrc: "/objects/bgPyramid.png", width: 256, height: 256 },
  { id: "lwSphinx", name: "Sphinx", imageSrc: "/objects/Sphinx.png", width: 128, height: 128 },
  { id: "obLifeChest", name: "Life Chest", imageSrc: "/objects/obLifeChest.png", width: 16, height: 16 },
  { id: "obMagicChest", name: "Magic Chest", imageSrc: "/objects/obMagicChest.png", width: 16, height: 16 },
  { id: "spriteTorch", name: "Torch", imageSrc: "/objects/spriteTorch.png", width: 96, height: 16, frameCount: 6, frameWidth: 16 }
]

const ENEMIES: EntityDefinition[] = [
  { id: "enMinotaur", name: "Minotaur", imageSrc: "/enemies/enMinotaur.png", width: 16, height: 16 },
  { id: "enUndead", name: "Undead", imageSrc: "/enemies/enUndead.png", width: 16, height: 16 },
  { id: "enHarpie", name: "Harpie", imageSrc: "/enemies/enHarpie.png", width: 16, height: 16 },
  { id: "enSkelbow", name: "Skelbow", imageSrc: "/enemies/enSkelbow.png", width: 16, height: 16 },
  { id: "enSkelbowL", name: "SkelbowL", imageSrc: "/enemies/enSkelbow.png", width: 16, height: 16 },
  { id: "enSkelbowR", name: "SkelbowR", imageSrc: "/enemies/enSkelbow.png", width: 16, height: 16 },
  { id: "enAnubisWarrior", name: "Anubis Warrior", imageSrc: "/enemies/enAnubisWarrior.png", width: 16, height: 16 },
  { id: "enDragon", name: "Dragon", imageSrc: "/enemies/enDragon.png", width: 16, height: 16 },
  { id: "enMummy", name: "Mummy", imageSrc: "/enemies/enMummy.png", width: 16, height: 16 },
  { id: "enScarab", name: "Scarab", imageSrc: "/enemies/enScarab.png", width: 16, height: 16 },
  { id: "enScorpion", name: "Scorpion", imageSrc: "/enemies/enScorpion.png", width: 16, height: 16 },
  { id: "enSpearman", name: "Spearman", imageSrc: "/enemies/enSpearman.png", width: 16, height: 16 },
  { id: "enVbow", name: "Vbow", imageSrc: "/enemies/enVbow.png", width: 16, height: 16 },
  { id: "enVsoldier", name: "Vsoldier", imageSrc: "/enemies/enVsoldier.png", width: 16, height: 16 },
  { id: "bossZeus", name: "Zeus", imageSrc: "/enemies/zeus.png", width: 16, height: 16 },
  { id: "standingBastet", name: "Bastet", imageSrc: "/enemies/bastet.png", width: 16, height: 16 },
  { id: "bossThor", name: "Thor", imageSrc: "/enemies/thor.png", width: 16, height: 16 }
]

const PLAYER_SPAWN: EntityDefinition[] = [
  { id: "spriteKratos", name: "Player Spawn", imageSrc: "/player/spriteKratos.png", width: 16, height: 16 },
]

export { OBJECTS, ENEMIES, PLAYER_SPAWN }
