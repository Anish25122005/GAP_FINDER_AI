import { describe, it, expect } from 'vitest';
import {
  parseSyllabusStructure,
  parseSyllabusWithMetadata,
  flattenTopicTree,
  extractSyllabusMetadata,
} from '@/lib/ai/syllabus-parser';

const osSyllabus = `Course Objectives:
The main objectives of the course are to provide understanding the fundamental concepts,
functions, and management techniques of operating systems

UNIT-I:
Operating Systems Overview: Introduction, operating system functions, operating systems
operations, Computing environments, Free and Open-Source Operating Systems System
Structures: Operating System Services, User and Operating-System Interface, system calls,
Types of System Calls, system programs, operating system Design and Implementation,
operating system structure, Building and Booting an Operating System, Operating system
debugging

UNIT-II:
Processes: Process Concept, Process scheduling, Operations on processes, Inter-process
communication. Threads and Concurrency: Multithreading models, Thread libraries,
Threadingissues. CPU Scheduling: Basic concepts, Scheduling criteria, Scheduling
algorithms, Multiple processor scheduling.

UNIT–III:
Synchronization Tools: The Critical Section Problem, Peterson’s Solution, Mutex Locks,
semaphores, Monitors, Classic problems of Synchronization. Deadlocks: system Model,
Deadlock characterization, Methods for handling Deadlocks, Deadlock prevention, Deadlock
avoidance, Deadlock detection, Recovery from Deadlock.

UNIT-IV:
Memory- Management Strategies: Introduction, Contiguous memory allocation, Paging,
Structure of the Page Table, Swapping. Virtual Memory Management: Introduction, Demand
paging, Copy-on-write, Page replacement Allocation of frames, Thrashing Storage
Management: Overview of Mass Storage Structure, HDD Scheduling.

UNIT-V:
File System: File System Interface: File concept, Access methods, Directory Structure; File-
system Implementation: File-system structure, File-system Operations, Directory
implementation, Allocation method, Free space management; File-System Internals: File-
System Mounting, Partitions and Mounting, File Sharing. Protection: Goals of protection,
Principles of protection, Protection Rings, Domain of protection, Access matrix`;

const variantSyllabus = `Unit 1: Introduction to Networks
Physical Layer: OSI Model, TCP/IP Suite, Guided Media, Wireless Transmission.

Unit 2: Data Link Layer
Error Detection: Parity Check, CRC, Hamming Distance. MAC Sublayer: CSMA/CD, Ethernet.

Unit 3: Network Layer
Routing: Distance Vector, Link State, OSPF, BGP. IP Addressing: IPv4, IPv6, Subnetting.`;

describe('GapFinder AI - Syllabus Parser Regression Tests', () => {
  it('extracts exactly 5 units for the Operating Systems syllabus', () => {
    const units = parseSyllabusStructure(osSyllabus);
    expect(units.length).toBe(5);
    expect(units.map((u) => u.code)).toEqual(['UI', 'UII', 'UIII', 'UIV', 'UV']);
  });

  it('keeps Course Objectives completely separate from units', async () => {
    const meta = extractSyllabusMetadata(osSyllabus);
    expect(meta.objectives.length).toBeGreaterThan(0);
    expect(meta.objectives[0]).toContain('understanding the fundamental concepts');

    const units = parseSyllabusStructure(osSyllabus);
    const unitNames = units.map((u) => u.name.toLowerCase());
    for (const name of unitNames) {
      expect(name).not.toContain('course objectives');
      expect(name).not.toContain('objectives');
    }
  });

  it('extracts major topics and subtopics for each unit without losing content', () => {
    const units = parseSyllabusStructure(osSyllabus);

    // Unit I
    const u1 = units[0];
    expect(u1.children && u1.children.length).toBeGreaterThanOrEqual(2);
    const u1TopicNames = u1.children!.map((c) => c.name);
    expect(u1TopicNames).toContain('Operating Systems Overview');

    // Unit II
    const u2 = units[1];
    expect(u2.children && u2.children.length).toBeGreaterThanOrEqual(3);
    const u2TopicNames = u2.children!.map((c) => c.name);
    expect(u2TopicNames).toContain('Processes');
    expect(u2TopicNames).toContain('Threads and Concurrency');
    expect(u2TopicNames).toContain('CPU Scheduling');

    // Unit III
    const u3 = units[2];
    expect(u3.children && u3.children.length).toBeGreaterThanOrEqual(2);
    const u3TopicNames = u3.children!.map((c) => c.name);
    expect(u3TopicNames).toContain('Synchronization Tools');
    expect(u3TopicNames).toContain('Deadlocks');

    // Unit IV
    const u4 = units[3];
    expect(u4.children && u4.children.length).toBeGreaterThanOrEqual(2);

    // Unit V
    const u5 = units[4];
    expect(u5.children && u5.children.length).toBeGreaterThanOrEqual(2);
    const u5TopicNames = u5.children!.map((c) => c.name);
    expect(u5TopicNames.some((n) => n.includes('Protection'))).toBe(true);
  });

  it('does not duplicate topics across units', () => {
    const units = parseSyllabusStructure(osSyllabus);
    const seenTopicNames = new Set<string>();

    for (const unit of units) {
      for (const topic of unit.children || []) {
        const key = topic.name.trim().toLowerCase();
        expect(seenTopicNames.has(key)).toBe(false);
        seenTopicNames.add(key);
      }
    }
  });

  it('flattens topic tree with deterministic temp IDs and parent references', () => {
    const units = parseSyllabusStructure(osSyllabus);
    const flattened = flattenTopicTree(units, 'subj-123', 'user-123');

    expect(flattened.length).toBeGreaterThan(15);
    const level1 = flattened.filter((t) => t.level === 1);
    expect(level1.length).toBe(5);

    // Level 2 topics must have a valid parentId pointing to a Level 1 temp ID
    const level2 = flattened.filter((t) => t.level === 2);
    expect(level2.length).toBeGreaterThan(0);
    const level1TempIds = new Set(level1.map((t: any) => t._tempId));
    for (const t2 of level2) {
      expect(level1TempIds.has(t2.parentId!)).toBe(true);
    }
  });

  it('handles Arabic numeral unit variants with titles', () => {
    const units = parseSyllabusStructure(variantSyllabus);
    expect(units.length).toBe(3);
    expect(units[0].name).toBe('Unit 1: Introduction to Networks');
    expect(units[0].code).toBe('U1');
    expect(units[0].children!.length).toBeGreaterThanOrEqual(1);
    expect(units[0].children![0].name).toBe('Physical Layer');
  });

  it('extracts metadata through parseSyllabusWithMetadata', async () => {
    const res = await parseSyllabusWithMetadata(osSyllabus);
    expect(res.units.length).toBe(5);
    expect(res.objectives.length).toBeGreaterThan(0);
    expect(res.objectives[0]).toContain('understanding the fundamental concepts');
  });
});
