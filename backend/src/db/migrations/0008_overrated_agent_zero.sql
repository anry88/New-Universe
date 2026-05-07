CREATE TABLE IF NOT EXISTS "sectors" (
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"z" integer NOT NULL,
	"seed" integer NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"system_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sectors_x_y_z_pk" PRIMARY KEY("x","y","z")
);
