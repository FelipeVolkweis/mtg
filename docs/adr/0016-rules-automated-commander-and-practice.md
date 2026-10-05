# Rules-automated Commander and Solo Practice

Commander Matches use server-owned legal actions, explicit human Priority passes, typed authored Card Abilities, and persisted payment and resolution choices. The first released pool is the complete mono-U sample; rejecting unsupported cards keeps imported facts separate from verified executable behavior, preserving ADR-0001, ADR-0008, ADR-0014, and ADR-0015.

Solo Practice uses the same rules engine with an inert additional Match Player and a supported mirror Library; only its Priority passes are automatic, and the human handles required practice choices. The Room retains one human participant and replacement consent belongs to current human Match Players.

This supersedes ADR-0003's manual gameplay, ADR-0011's manual Priority and resolution, and ADR-0013's one-player Match model. Legacy manual active Matches and saved Decklists remain persisted; a legacy Match requires unanimous human consent for replacement instead of being converted into an unverified rules state.
