#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pydantic Models for RGAU-MSHA Timiryazevka Schedule Dataset.
Provides strict schema validation, type enforcement, and serialization.
"""

from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

ClassType = Literal["lecture", "practice", "lab", "elective"]
WeekType = Literal["all", "odd", "even"]

class SubgroupItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    subgroup: int = Field(..., description="Subgroup index, e.g. 1 or 2")
    teacher: str = Field(..., description="Teacher name for this subgroup")
    building: str = Field(..., description="Building name")
    room: str = Field(..., description="Room identifier")

class ClassItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: int = Field(..., description="Unique integer ID for the class session")
    num: int = Field(..., ge=1, le=8, description="Pair bell number (1..7)")
    start: str = Field(..., description="Class start time (HH:MM)")
    end: str = Field(..., description="Class end time (HH:MM)")
    subject: str = Field(..., description="Course/Discipline name")
    type: ClassType = Field(default="lecture", description="Pedagogical format")
    teacher: str = Field(default="Преподаватель", description="Full teacher name or slash-separated")
    building: str = Field(default="1-й учебный корпус", description="University building")
    room: str = Field(default="—", description="Classroom number")
    weekType: WeekType = Field(default="all", description="Week parity: all, odd, or even")
    subgroups: Optional[List[int]] = Field(default=None, description="Array of active subgroups, e.g. [1, 2]")
    subgroupDetails: Optional[List[SubgroupItem]] = Field(default=None, description="Detailed subgroup entries")

class DaySchedule(BaseModel):
    model_config = ConfigDict(extra="ignore")
    weekday: str = Field(..., description="Russian day name, e.g. Понедельник")
    classes: List[ClassItem] = Field(default_factory=list)

class GroupSchedule(BaseModel):
    model_config = ConfigDict(extra="ignore")
    institute: str = Field(..., description="Full institute name")
    course: int = Field(default=1, ge=1, le=6, description="Course year (1..6)")
    level: str = Field(default="Бакалавриат", description="Education level: Бакалавриат, Магистратура, etc.")
    schedule: List[DaySchedule] = Field(default_factory=list)
    officialPdfUrl: Optional[str] = Field(default=None, description="Direct URL of the source PDF")

class Metadata(BaseModel):
    model_config = ConfigDict(extra="ignore")
    source: str = Field(default="timacad.ru")
    sourceUrl: str = Field(default="https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia")
    electronicSchedule: str = Field(default="https://eg.timacad.ru/schedule/groups/")
    academicYear: str = Field(default="2026/2027")
    semester: str = Field(default="1 семестр 2026/2027")
    generatedAt: str = Field(..., description="ISO 8601 generation timestamp")
    totalGroups: int = Field(..., ge=0)
    groupsWithData: int = Field(..., ge=0)
    version: str = Field(default="1.0.2")

class ScheduleDataset(BaseModel):
    model_config = ConfigDict(extra="ignore")
    metadata: Metadata
    groups: Dict[str, GroupSchedule]
