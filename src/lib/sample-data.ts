import { repository } from '@/lib/db/repository';
import { generateEmbeddings, generateEmbedding } from '@/lib/ai/embeddings';
import { chunkExtractedDocument } from '@/lib/ai/chunker';
import { extractTextFromTxt } from '@/lib/ai/text-extractor';
import { mapChunksToTopics } from '@/lib/ai/topic-mapper';
import { generateQuestionsForTopic } from '@/lib/ai/question-generator';

export const SAMPLE_COURSE = {
  name: 'Distributed Systems & Cloud Computing',
  code: 'CS 401',
  description:
    'Comprehensive study of distributed systems architectures, consensus protocols, consistency models, and cloud storage scalability.',
  syllabusText: `Unit 1: Foundations of Distributed Systems
1.1 Distributed Architectures
- Client-Server and Multi-tier architectures
- Peer-to-Peer networks and decentralized overlays
- Service-Oriented and Microservice designs
1.2 System Models and Failure Modes
- Synchronous vs Asynchronous networks
- Crash-stop vs Byzantine fault models
- Network partitions and the CAP Theorem

Unit 2: Time, Ordering and Consensus
2.1 Logical Clocks and Event Ordering
- Lamport logical clocks and partial ordering
- Vector clocks and concurrent event detection
2.2 Distributed Consensus Protocols
- Two-Phase Commit (2PC) and blocking vulnerabilities
- Raft consensus algorithm: Leader election and log replication
- Paxos overview and safety guarantees

Unit 3: Distributed Storage and Scalability
3.1 Partitioning and Consistent Hashing
- Hash ring data distribution and virtual nodes
- Rebalancing overhead during node join/leave
3.2 Replication and Consistency Models
- Strong consistency vs Eventual consistency
- Quorum-based replication (R + W > N)
- The PACELC theorem and latency trade-offs
`,
  studyNotesText: `Chapter 1: Foundations and System Models

1.1 Distributed Architectures
A distributed system is a collection of autonomous computing nodes that communicate over a network and coordinate actions by passing messages. In a client-server architecture, clients send requests to a centralized server which processes the request and returns a response. While simple, client-server models present a single point of failure and potential scalability bottlenecks. Modern cloud architectures frequently employ microservices, where complex applications are decomposed into loosely coupled, independently deployable services that communicate via lightweight protocols such as gRPC or REST.

Peer-to-peer (P2P) systems eliminate centralized servers entirely. In an unstructured P2P network, nodes join arbitrarily and use flooding or random walks for message routing. In structured P2P networks, distributed hash tables (DHTs) such as Chord provide deterministic O(log N) lookup routing.

1.2 System Models and Failure Modes
Distributed systems are analyzed under distinct timing assumptions:
- Synchronous systems: Known upper bounds exist for message transmission delay, clock drift, and processing time. Timeouts can reliably detect node failures.
- Asynchronous systems: No assumptions can be made about processing speeds or message delivery times. Messages may take arbitrarily long to arrive. By the FLP Impossibility Theorem (Fischer, Lynch, Paterson, 1985), deterministic asynchronous consensus is impossible in the presence of even a single unannounced crash failure.

Failure models define how components may fail:
- Crash-Stop: A node ceases operating and never recovers.
- Crash-Recovery: A node stops operating, recovers after an arbitrary duration, and resumes execution using stable persistent storage.
- Byzantine Failures: Nodes may behave arbitrarily or maliciously, sending conflicting messages to different peers or deliberately violating protocol specifications.

The CAP Theorem (Fox and Brewer):
In an asynchronous network subject to partitions (P), a distributed data store can guarantee at most two of the following three properties simultaneously:
1. Consistency (C): Every read receives the most recent write or an error (linearizability).
2. Availability (A): Every non-failing node returns a non-error response for every request without guarantee that it contains the most recent write.
3. Partition Tolerance (P): The system continues to operate despite an arbitrary number of messages being dropped or delayed by the network.
Since network partitions are unavoidable in physical networks, distributed system architects must choose between Consistency (CP) and Availability (AP) during a partition.

---

Chapter 2: Logical Time and Consensus

2.1 Logical Clocks and Event Ordering
Physical quartz clocks in distributed nodes suffer from clock drift due to temperature and hardware variations. Relying on physical timestamps for ordering leads to causality anomalies.
Leslie Lamport introduced logical clocks in 1978. Let a -> b denote that event a "happened-before" event b.
- If a and b occur within the same process and a precedes b, then a -> b.
- If a is the sending of a message by one process and b is the receipt of that message by another process, then a -> b.
- If a -> b and b -> c, then a -> c (transitivity).

Lamport Clocks associate a monotonically increasing scalar counter L(e) with each event:
- Process increments local clock before each internal event: L = L + 1.
- Message sends include local clock: send(m, L).
- Upon receipt of (m, L_msg), recipient updates: L = max(L, L_msg) + 1.
Condition: If a -> b, then L(a) < L(b). However, the converse does NOT hold: L(a) < L(b) does not imply that a -> b (they could be concurrent).

Vector Clocks solve this limitation. Each process i maintains a vector V of size N (number of processes).
- Increment V[i] before internal event.
- Transmit vector V with messages.
- On receipt of V_msg, set V[j] = max(V[j], V_msg[j]) for all j, and increment V[i].
Vector clocks provide exact causal ordering: a -> b if and only if V(a) < V(b). If neither V(a) <= V(b) nor V(b) <= V(a), events a and b are causally concurrent (a || b).

2.2 Distributed Consensus Protocols
Consensus requires a set of processes to agree on a single value or sequence of values (log entries) such that:
- Agreement: All non-faulty processes decide on the same value.
- Validity: If all processes propose value v, then any decided value must be v.
- Termination: Every non-faulty process eventually decides.

Two-Phase Commit (2PC):
An atomic commitment protocol used in distributed transactions:
- Phase 1 (Prepare): Coordinator sends PREPARE to all cohorts. Cohorts execute transaction locally, write to undo/redo logs, and vote YES or NO.
- Phase 2 (Commit/Abort): If all cohorts vote YES, coordinator logs COMMIT and sends GLOBAL_COMMIT. If any cohort votes NO or times out, coordinator sends GLOBAL_ABORT.
Limitation: 2PC is a blocking protocol. If the coordinator crashes after cohorts vote YES, cohorts remain blocked indefinitely, holding database locks because they cannot determine whether the coordinator decided to commit or abort.

Raft Consensus:
Raft decomposes consensus into three independent subproblems:
1. Leader Election: Nodes are in Leader, Follower, or Candidate state. If a follower does not receive heartbeats within an election timeout, it becomes a candidate, increments its term, votes for itself, and sends RequestVote RPCs. A candidate becomes leader upon receiving votes from a majority of nodes (quorum: N/2 + 1).
2. Log Replication: The leader accepts client proposals, appends them to its local log, and issues AppendEntries RPCs to followers. When a log entry is safely replicated on a majority of followers, the leader commits it and applies it to its state machine.
3. Safety: If a leader has committed a log entry for a given term, that entry will be present in the logs of the leaders for all higher terms. Candidates cannot win an election unless their log is at least as up-to-date as any majority member.

---

Chapter 3: Distributed Storage and Scalability

3.1 Partitioning and Consistent Hashing
In large-scale storage systems (e.g., DynamoDB, Cassandra), data must be partitioned (sharded) across multiple physical servers. Simple modulo hashing (hash(key) mod N) fails catastrophically when nodes join or leave, requiring almost all keys (N / (N+1)) to be migrated.

Consistent Hashing maps both keys and server nodes to a uniform circular ring space (e.g., 0 to 2^32 - 1) using a cryptographic hash function like SHA-256. A key is assigned to the first node whose position is greater than or equal to the key's position on the ring.
Advantages:
- When a new node joins or leaves, only K/N keys need to be reassigned on average.
- Virtual Nodes (vnodes): Each physical machine is mapped to multiple distinct points on the ring. This prevents hotspotting, ensures uniform data distribution, and allows heterogeneous hardware to host varying capacities.

3.2 Replication and Consistency Models
Replication ensures fault tolerance and low latency.
Quorum-based replication configures:
- N: Total replica count for each partition.
- W: Write quorum (number of replicas that must acknowledge a write before success).
- R: Read quorum (number of replicas that must respond before completing a read).

Quorum Rule for Strong Consistency:
R + W > N
If R + W > N, the read set and write set must overlap in at least one replica node. By comparing version numbers or vector clocks, the client is guaranteed to read the latest written data. For example, in a system with N=3 replicas, setting R=2 and W=2 ensures strong consistency.

The PACELC Theorem (Daniel Abadi, 2012):
An extension of the CAP theorem:
If there is a Partition (P), how does your system trade Consistency (C) and Availability (A)?
Else (E) when the network operates normally, how does your system trade Latency (L) and Consistency (C)?
Examples:
- MongoDB and Spanner are PC/EC: During partitions they prioritize consistency; in normal state they maintain consistency at the cost of latency.
- Dynamo and Cassandra are PA/EL: During partitions they favor availability; in normal state they favor low latency over immediate consistency (eventual consistency).
`,
};

/**
 * Seeds a full demonstration subject for the specified user account.
 * Creates the subject, syllabus topics, indexes notes into chunks,
 * computes vector embeddings, and maps chunks to topics.
 */
export async function seedDemoSubjectForUser(userId: string) {
  // 1. Create Subject
  const subject = await repository.createSubject(userId, {
    name: SAMPLE_COURSE.name,
    code: SAMPLE_COURSE.code,
    description: SAMPLE_COURSE.description,
  });

  // 2. Parse and save topics
  const { parseSyllabus, flattenTopicTree } = await import('@/lib/ai/syllabus-parser');
  const parsedNodes = await parseSyllabus(SAMPLE_COURSE.syllabusText);
  const flattened = flattenTopicTree(parsedNodes, subject.id, userId);
  const savedTopics = await repository.saveTopics(userId, subject.id, flattened);

  // 3. Create Document Record
  const doc = await repository.createDocument(userId, {
    subjectId: subject.id,
    title: 'Distributed Systems & Cloud Architecture Lecture Notes',
    filename: 'cs401_distributed_systems_notes.txt',
    fileType: 'txt',
    fileSize: Buffer.byteLength(SAMPLE_COURSE.studyNotesText, 'utf-8'),
    status: 'processing',
  });

  // 4. Extract and Chunk Notes
  const extraction = extractTextFromTxt(Buffer.from(SAMPLE_COURSE.studyNotesText, 'utf-8'));
  const generatedChunks = chunkExtractedDocument(extraction);

  // 5. Generate Embeddings for chunks
  const textsToEmbed = generatedChunks.map((c) => `${c.sectionTitle || ''}: ${c.content}`);
  const embeddings = await generateEmbeddings(textsToEmbed);

  // 6. Save Chunks
  const chunkRecords = generatedChunks.map((c, idx) => ({
    documentId: doc.id,
    userId,
    subjectId: subject.id,
    chunkIndex: c.chunkIndex,
    pageNumber: c.pageNumber,
    sectionTitle: c.sectionTitle,
    content: c.content,
    tokenCount: c.tokenCount,
    embedding: embeddings[idx],
  }));

  const savedChunks = await repository.saveChunks(chunkRecords);

  // 7. Map Chunks to Topics
  await mapChunksToTopics(savedTopics, savedChunks, 0.25);

  return {
    subject,
    topics: savedTopics,
    document: doc,
    chunkCount: savedChunks.length,
  };
}
