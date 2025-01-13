"""Script to schedule and manage ETL pipeline using Prefect."""
import argparse
import logging
from datetime import datetime, timedelta
from pathlib import Path

from prefect import Flow
from prefect.schedules import CronSchedule, IntervalSchedule
from prefect.utilities.logging import get_logger

from chicago_crash_bot.pipelines.etl_pipeline import run_etl_pipeline

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def create_schedule(schedule_type: str, value: str) -> CronSchedule | IntervalSchedule:
    """Create Prefect schedule based on type and value.
    
    Args:
        schedule_type: Type of schedule ('cron' or 'interval')
        value: Schedule value (cron expression or interval in minutes)
    
    Returns:
        Prefect schedule object
    """
    if schedule_type == 'cron':
        return CronSchedule(value)
    else:
        minutes = int(value)
        return IntervalSchedule(
            interval=timedelta(minutes=minutes),
            start_date=datetime.utcnow()
        )

def register_flow(
    schedule_type: str = None,
    schedule_value: str = None,
    initial_load: bool = False,
    csv_path: Path = None
) -> Flow:
    """Register ETL pipeline flow with Prefect.
    
    Args:
        schedule_type: Optional schedule type ('cron' or 'interval')
        schedule_value: Optional schedule value
        initial_load: Whether to perform initial CSV load
        csv_path: Path to CSV file for initial load
    
    Returns:
        Registered Prefect flow
    """
    # Create schedule if specified
    schedule = None
    if schedule_type and schedule_value:
        schedule = create_schedule(schedule_type, schedule_value)
    
    # Create flow
    with Flow(
        "chicago_crashes_etl",
        schedule=schedule
    ) as flow:
        flow.run(
            initial_load=initial_load,
            csv_path=csv_path
        )
    
    # Register flow with Prefect
    flow.register(project_name="chicago_crash_bot")
    
    return flow

def main():
    """Main function."""
    parser = argparse.ArgumentParser(description="Schedule ETL pipeline")
    
    # Schedule options
    schedule_group = parser.add_argument_group("Schedule Options")
    schedule_group.add_argument(
        "--schedule-type",
        choices=['cron', 'interval'],
        help="Type of schedule"
    )
    schedule_group.add_argument(
        "--schedule-value",
        help="Schedule value (cron expression or interval in minutes)"
    )
    
    # Initial load options
    load_group = parser.add_argument_group("Initial Load Options")
    load_group.add_argument(
        "--initial-load",
        action="store_true",
        help="Perform initial CSV load"
    )
    load_group.add_argument(
        "--csv-path",
        type=Path,
        help="Path to CSV file for initial load"
    )
    
    # Flow management options
    manage_group = parser.add_argument_group("Flow Management")
    manage_group.add_argument(
        "--disable",
        action="store_true",
        help="Disable existing flow schedule"
    )
    manage_group.add_argument(
        "--enable",
        action="store_true",
        help="Enable existing flow schedule"
    )
    manage_group.add_argument(
        "--delete",
        action="store_true",
        help="Delete existing flow"
    )
    
    args = parser.parse_args()
    
    try:
        # Handle flow management commands
        if args.disable or args.enable or args.delete:
            from prefect.client import Client
            client = Client()
            
            # Get existing flow
            flows = client.get_flows(project_name="chicago_crash_bot")
            if not flows:
                logger.error("No existing flow found")
                return
            
            flow_id = flows[0].id
            
            if args.disable:
                client.set_flow_schedule_state(flow_id, False)
                logger.info("Flow schedule disabled")
            
            elif args.enable:
                client.set_flow_schedule_state(flow_id, True)
                logger.info("Flow schedule enabled")
            
            elif args.delete:
                client.delete_flow(flow_id)
                logger.info("Flow deleted")
            
            return
        
        # Validate schedule arguments
        if bool(args.schedule_type) != bool(args.schedule_value):
            parser.error("Both --schedule-type and --schedule-value must be provided together")
        
        # Validate initial load arguments
        if args.initial_load and not args.csv_path:
            parser.error("--csv-path is required with --initial-load")
        
        if args.csv_path and not args.csv_path.exists():
            parser.error(f"CSV file not found: {args.csv_path}")
        
        # Register flow
        flow = register_flow(
            schedule_type=args.schedule_type,
            schedule_value=args.schedule_value,
            initial_load=args.initial_load,
            csv_path=args.csv_path
        )
        
        logger.info(
            "Flow registered successfully. "
            f"Schedule: {args.schedule_type + ': ' + args.schedule_value if args.schedule_type else 'None'}"
        )
        
        # Run flow if no schedule
        if not args.schedule_type:
            flow_state = flow.run()
            logger.info(f"Flow run completed with state: {flow_state.message}")
    
    except Exception as e:
        logger.error(f"Failed to manage flow: {str(e)}")
        raise

if __name__ == "__main__":
    main()
